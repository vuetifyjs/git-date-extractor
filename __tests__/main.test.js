// @ts-check
const test = require('ava').default;
const {iDebugLog} = require('../src/tst-helpers');

const childProc = require('child_process');
const fse = require('fs-extra');
const main = require('../src');
const {posixNormalize, getKernelInfo, getSemverInfo} = require('../src/helpers');
const tstHelpers = require('../src/tst-helpers');

// Set up some paths for testing
const cacheFileName = 'cache.json';
const tempDirNames = {
	mainPostTest: 'tempdir-main-post',
	mainPreTest: 'tempdir-main-pre'
};

// Max variance for time diff
const maxTimeVarianceSec = 2;

// Time tracking
const perfTimings = {
	postCommit: {
		start: 0,
		stop: 0,
		elapsed: 0
	},
	preCommit: {
		start: 0,
		stop: 0,
		elapsed: 0
	}
};

/**
 * This is really a full integration test
 */
test('main - integration test - git post commit', async t => {
	// Create test dir
	const tempDirName = tempDirNames.mainPostTest;
	const tempDirPath = posixNormalize(__dirname + '/' + tempDirName);
	const cacheFilePath = posixNormalize(`${tempDirPath}/${cacheFileName}`);
	const {testFiles, testFilesNamesOnly} = tstHelpers.buildTestDir(tempDirPath, true);
	const checkTimeDelayMs = 5000;
	// Git add the files, since we are emulating a post commit
	childProc.execSync('git add . && git commit -m "added files"', {
		cwd: tempDirPath
	});
	// Wait a bit so that we can make sure there is a difference in stamps
	await (new Promise((resolve) => {
		setTimeout(() => {
			resolve();
		}, checkTimeDelayMs);
	}));
	// Touch alpha so it can be re-staged and committed - thus giving it a later modification stamp
	tstHelpers.touchFileSync(testFiles.alpha, true);
	// Git commit all the files
	childProc.execSync('git add . && git commit -m "added files"', {
		cwd: tempDirPath
	});
	// Now run full process - get stamps, save to file, etc.
	perfTimings.postCommit.start = (new Date()).getTime();
	/**
	 * @type {InputOptions}
	 */
	const dummyOptions = {
		projectRootPath: tempDirPath,
		gitCommitHook: 'post',
		outputToFile: true,
		outputFileName: cacheFileName
	};
	// Run
	const result = await main.getStamps(dummyOptions);
	perfTimings.postCommit.stop = (new Date()).getTime();
	const savedResult = JSON.parse(fse.readFileSync(cacheFilePath).toString());
	// Check that the value passed back via JS matches what was saved to JSON
	t.deepEqual(result, savedResult);
	// Check that last commit was from self
	t.truthy(tstHelpers.wasLastCommitAutoAddCache(tempDirPath, cacheFileName));

	// Check that actual numbers came back for stamps for files,
	// but ignore .dotdir, as those are blocked by default
	delete testFilesNamesOnly['.dotdir'];
	tstHelpers.testForStampInResults(t, testFilesNamesOnly, result);

	// Check a specific file stamp to verify it makes sense
	const alphaStamp = result['alpha.txt'];
	t.true(typeof (alphaStamp.created) === 'number');
	t.true(typeof (alphaStamp.modified) === 'number');
	// Important: Check the time difference between file creation and modified. If processor failed, these will be the same due to file stat. If success, then there should be a 10 second diff between creation (file stat) and modified (git add)
	const timeDelay = Number(alphaStamp.modified) - Number(alphaStamp.created);
	// Assume a small variance is OK
	const timeDiff = Math.abs((Math.floor(checkTimeDelayMs / 1000)) - timeDelay);
	t.true(timeDiff <= maxTimeVarianceSec, `Diff between created and modified should have been ${Math.floor(checkTimeDelayMs / 1000)}, but was ${timeDelay}. This variance of ${timeDiff} is beyond the accepted variance of ${maxTimeVarianceSec}.`);
});

test('main - integration test - git pre commit', async t => {
	// Create test dir
	const tempDirName = tempDirNames.mainPreTest;
	const tempDirPath = posixNormalize(__dirname + '/' + tempDirName);
	const {testFiles} = tstHelpers.buildTestDir(tempDirPath, true, cacheFileName);
	const checkTimeDelayMs = 8000;
	// Wait a bit so that we can make sure there is a difference in stamps
	await (new Promise((resolve) => {
		setTimeout(() => {
			resolve();
		}, checkTimeDelayMs);
	}));
	// Touch alpha so that it will have a different mtime value
	tstHelpers.touchFileSync(testFiles.alpha, true);
	// Now run full process - get stamps, save to file, etc.
	/**
	 * @type {InputOptions}
	 */
	const dummyOptions = {
		projectRootPath: tempDirPath,
		gitCommitHook: 'pre',
		outputToFile: true,
		outputFileName: cacheFileName,
		outputFileGitAdd: true
	};
	// Run
	perfTimings.preCommit.start = (new Date()).getTime();
	const result = await main.getStamps(dummyOptions);
	perfTimings.preCommit.stop = (new Date()).getTime();
	// Now the cache file should be *staged* but **not** committed, since we used `pre`
	t.falsy(tstHelpers.wasLastCommitAutoAddCache(tempDirPath, cacheFileName));
	// Check that actual numbers came back for stamps
	const alphaStamp = result['alpha.txt'];
	t.true(typeof (alphaStamp.created) === 'number');
	t.true(typeof (alphaStamp.modified) === 'number');

	/**
	 * For Node v8 & v9, on any kernel version of linux, fs.stat does not return valid birthtime (aka creation time)
	 * On newer Node (10.16.0+), they take advantage of glibc (2.28+) syscall to statx(), which is in kernel 4.11+, and returns good birthtime
	 * So, skip test if (node v < 10.16.0 && linux) OR (node v >= 10.16.0 && linux  && kernel < 4.11)
	 */
	let skipNonGitBirthTest = false;
	if (process.platform !== 'win32') {
		let hasStatX = true;
		const kInfo = getKernelInfo();
		const nodeInfo = getSemverInfo(process.versions.node);
		if (kInfo.base < 5 && kInfo.major < 11) {
			hasStatX = false;
		}
		if (nodeInfo.major < 10 || (nodeInfo.major === 10 && nodeInfo.minor < 16)) {
			hasStatX = false;
		}
		if (hasStatX === false) {
			skipNonGitBirthTest = true;
			t.pass('Non-git-based birthtime test skipped for OS without statx() available');
		}
	}
	if (skipNonGitBirthTest === false) {
		// Check time difference in stamps. Note that both modified and created stamps should be based off file stat, since no git history has been created
		const timeDelay = Number(alphaStamp.modified) - Number(alphaStamp.created);
		const timeDiff = Math.abs((Math.floor(checkTimeDelayMs / 1000)) - timeDelay);
		t.true(timeDiff <= maxTimeVarianceSec, `Diff between created and modified should have been ${Math.floor(checkTimeDelayMs / 1000)}, but was ${timeDelay}. This variance of ${timeDiff} is beyond the accepted variance of ${maxTimeVarianceSec}.`);
	}
});

// Teardown dir and files
test.serial.after.always(async () => {
	for (const key in perfTimings) {
		perfTimings[key].elapsed = perfTimings[key].stop - perfTimings[key].start;
	}
	iDebugLog(perfTimings);
	const dirNames = Object.keys(tempDirNames).map(key => tempDirNames[key]);
	for (let x = 0; x < dirNames.length; x++) {
		const tempDirPath = posixNormalize(__dirname + '/' + dirNames[x]);
		// eslint-disable-next-line no-await-in-loop
		await tstHelpers.removeTestDir(tempDirPath);
	}
});
