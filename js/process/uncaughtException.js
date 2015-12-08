/**
 * Created by Hunter on 7/5/2015.
 */
"use strict";

/**
 * Setup uncaught exception handler
 * @param process
 * @param exceptionHandler
 * @param exitHandler
 *
 * Usage:
 *  - require('../js/process/uncaughtException').init(process);
 */
exports.init = function(process, exceptionHandler, exitHandler){
    process.on('uncaughtException', exceptionHandler||function(err){
        console.error('Stack message: ', err.message);
        console.error('Stack trace: ', err.stack);
    });

    process.on('exit', exitHandler||function(code){
        console.error('System exit with code: %j', code);
    });
};