/**
 * Created by Hunter on 12/21/2015.
 */
"use strict";

function getReqNumFunc() {
    var reqNum = 0;
    return function(){
        return ++reqNum;
    };
}

exports.getReqNumFunc = getReqNumFunc;