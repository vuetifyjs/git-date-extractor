// @ts-check
'use strict';

import {posixNormalize, replaceZeros, getIsInGitRepo} from './helpers';
const { updateTimestampsCacheFile, getTimestampsFromFile } = require('./cachefile-handler');
import FilelistHandler from './filelist-handler';

// Core Node
const readline = require('readline');
const childProc = require('child_process');
// Extras
const fse = require('fs-extra');

/**
*
* @param {Options} optionsObj
*/
function main(optionsObj){
	if (!getIsInGitRepo()){
		throw('Fatal Error: You are not in a git initialized project space! Please run git init.');
	}
	/**
	* @type StampCache
	*/
	let timestampsCache = {};
	let readCacheFile = typeof(optionsObj.outputFileName)==='string' && optionsObj.outputFileName.length > 0;
	let writeCacheFile = readCacheFile && optionsObj.outputToFile;
	// Load in cache if applicable
	if (readCacheFile){
		if (!fse.existsSync(optionsObj.outputFileName)){
			fse.writeFileSync(optionsObj.outputFileName,'{}');
		}
		else {
			try {
				timestampsCache = JSON.parse(fse.readFileSync(optionsObj.outputFileName).toString());
			}
			catch (e){
				console.warn(`Could not read in cache file @ ${optionsObj.outputFileName}`)
			}
		}
	}
	// Get filepaths
	let filePaths = (new FilelistHandler(optionsObj)).filePaths;
	/**
	* Now iterate through filepaths to get stamps
	*/
	if (filePaths.length > 0) {
		// Add line break
		console.log('');
	}
	for (let f = 0; f < filePaths.length; f++) {
		let currFullPath = filePaths[f].fullPath;
		let currLocalPath = filePaths[f].relativeToProjRoot;
		// Nice progress indicator in console
		if (process.stdout && readline) {
			readline.clearLine(process.stdout, 0);
			readline.cursorTo(process.stdout, 0, null);
			process.stdout.write(`Scraping Date info for file #${f + 1} / ${filePaths.length} ---> ${currLocalPath}`);
			// If this is the last loop, close out the line with a newline
			if (f === filePaths.length - 1) {
				process.stdout.write('\n');
			}
		}
		// Normalize path, force to posix style forward slash
		currFullPath = posixNormalize(currFullPath);
		// Update obj
		timestampsCache[currLocalPath] = getTimestampsFromFile(currFullPath, timestampsCache, currLocalPath, optionsObj.gitCommitHook, false);
	}
	if (writeCacheFile){
		updateTimestampsCacheFile(optionsObj.outputFileName, timestampsCache);
	}
	return timestampsCache;
}



module.exports = {
	/**
	*
	* @param {Options} options
	*/
	getStamps: function(options){
		return main(options);
	}
};
