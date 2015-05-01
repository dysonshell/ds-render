'use strict';
var path = require('path');
var tape = require('tape');
var co = require('co');
GLOBAL.APP_ROOT = path.resolve(__dirname, '../example');
// var app = require('../example');
var render = require('../../');

tape(function (test) {
    test.plan(3);
    co(function *() {
        var viewPath = APP_ROOT + '/ccc/testc/views/ccc.html';
        var partials = yield render.getParsedPartials(viewPath);
        var template = yield render.getParsedTemplate(viewPath);
        test.ok(partials.tc);
        test.ok(partials['d.e']);
        test.ok(template);
    }).catch(function (err) {
        test.ok(!err);
    });
});
