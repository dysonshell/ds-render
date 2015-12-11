'use strict';
var path = require('path');
process.env.NODE_CONFIG_DIR = path.resolve(__dirname, '..', 'example', 'config');
var tape = require('tape');
var co = require('co');
// var app = require('../example');
var render = require('../../');
require('ractive').DEBUG = false;

console.log(process.env.NODE_CONFIG_DIR);
var APP_ROOT = require('config').dsAppRoot;
tape('parse', function (test) {
    test.plan(3);
    co(function *() {
        var viewPath = APP_ROOT + '/ccc/testc/views/ccc.html';
        var partials = yield render.getParsedPartials(viewPath);
        var template = yield render.getParsedTemplate(viewPath);
        test.ok(partials.tc);
        test.ok(partials['d/e']);
        console.log('partials', partials);
        test.ok(template);
    }).catch(function (err) {
        console.log(err);
        test.ok(!err);
    });
});

tape('render', function (test) {
    test.plan(1);
    co(function *() {
        var viewPath = APP_ROOT + '/ccc/testc/views/ccc.html';
        var html = yield render.renderView({path: viewPath}, Promise.resolve({
            lv: 'local variable',
            pv: Promise.resolve('promised variable')
        }));
        console.log(html);
        test.equal(html, 'partial in testc<br>tc.d<br>local variable<br>promised variable');
    }).catch(function (err) {
        console.log(err);
        test.ok(!err);
    });
});
