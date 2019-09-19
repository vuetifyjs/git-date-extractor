#!/usr/bin/env node
'use strict';
const meow = require('meow');
const gitDateExtractor = require('.');
const { validateOptions } = require('./helpers');
const { debugLog } = require('./tst-helpers');

const cli = meow(`
	Usage
	  $ git-date-extractor [input]
	  $ git-dates [input]

	Options (all are optional):
	  --outputToFile {boolean} [Default: false]
	  --outputFileName {string} [Default: timestamps.json]
	  --outputFileGitAdd {boolean} [Default: false*] *default=true if gitCommitHook is set
	  --files {string[] | string}
	  --onlyIn {string[] | string}
	  --blockFiles {string[] | string}
	  --allowFiles {string[] | string}
	  --gitCommitHook {"post" | "pre" | "none"} [Default: "none"]
	  --projectRootPath {string}

	Examples
	  $ git-date-extractor
	  {
		'alpha.txt': { created: 1568789925, modified: 1568790468 },
		'bravo.txt': { created: 1568789925, modified: 1568790468 },
		'subdir/charlie.txt': { created: 1568789925, modified: 1568790368 }
	  }
	  $ git-date-extractor --files=[alpha.txt] --outputFileGitAdd=true --gitCommitHook=post
	  timestamps updated
`, {
	flags: {
		outputToFile: {
			type: 'boolean',
			default: false,
			alias: 'out'
		},
		outputFileName: {
			type: 'string',
			default: undefined,
			alias: 'outFile'
		},
		outputFileGitAdd: {
			type: 'boolean',
			default: undefined,
			alias: 'gitAdd'
		},
		files: {
			type: 'string',
			default: undefined,
			alias: 'file'
		},
		onlyIn: {
			type: 'string',
			default: undefined,
			alias: 'dirs'
		},
		blockFiles: {
			type: 'string',
			default: undefined,
			alias: 'blocklist'
		},
		allowFiles: {
			type: 'string',
			default: undefined,
			alias: 'whitelist'
		},
		gitCommitHook: {
			type: 'string',
			default: 'none',
			alias: 'git-stage'
		},
		projectRootPath: {
			type: 'string',
			default: undefined,
			alias: 'rootDir'
		}
	}
});

// Files can be passed either through flag OR just as args to cli
let options = cli.flags;
let finalizedOptions = validateOptions(options);
let regularArgs = cli.input;
finalizedOptions.files = finalizedOptions.files.concat(regularArgs);

// Call main with options
let result = gitDateExtractor.getStamps(finalizedOptions);
if (!finalizedOptions.outputToFile){
	console.log(result);
}
else {
	let msg = 'timestamps file updated';
	console.log(msg);
}
