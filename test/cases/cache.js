'use strict';
var path = require('path');
var Promise = require('bluebird');
process.env.NODE_CONFIG_DIR = path.resolve(__dirname, '..', 'example', 'config');
var tape = require('tape');
// var app = require('../example');
var render = require('../../');
require('ractive').DEBUG = false;

console.log(process.env.NODE_CONFIG_DIR);
var APP_ROOT = require('config').dsAppRoot;

var cache = {};

tape('render', function (test) {
    test.plan(3);
    Promise.coroutine(function *() {
        var viewPath = APP_ROOT + '/ccc/testc/views/ccc.html';
        var html = yield render.renderView(cache, (yield render.getView(cache, viewPath)), void 0, Promise.resolve({
            lv: 'local variable',
            pv: Promise.resolve('promised variable')
        }));

        test.ok(cache[viewPath]);
        test.ok(cache[viewPath+'|']);

        // render again, should hit cache
        var html = yield render.renderView(cache, (yield render.getView(cache, viewPath)), void 0, Promise.resolve({
            lv: 'local variable',
            pv: Promise.resolve('promised variable')
        }));
        console.log(html);
        console.log(Object.keys(cache));
        test.equal(html, 'partial in testc<br>tc.d<br>local variable<br>promised variable');
    })().catch(function (err) {
        console.log(err.stack);
        test.ok(!err);
    });
});

tape('render with layout', function (test) {
    test.plan(3);
    Promise.coroutine(function *() {
        var viewPath = APP_ROOT + '/ccc/global/views/ld.html';
        var layoutPath = APP_ROOT + '/ccc/global/views/layouts/default.html';
        var html = yield render.renderView(cache, (yield render.getView(cache, viewPath)), (yield render.getView(cache, layoutPath)), Promise.resolve({
            a: 1,
        }));
        console.log(html);
        console.log(Object.keys(cache));
        test.ok(cache[viewPath]);
        test.ok(cache[viewPath+'|'+layoutPath]);
        var ck = Object.keys(cache);

        var html = yield render.renderView(cache, (yield render.getView(cache, viewPath)), (yield render.getView(cache, layoutPath)), Promise.resolve({
            a: 1,
        }));
        console.log(html);

        test.equal(html, '<!DOCTYPE html><!-- comments kept --><title>partial a1</title><!DOCTYPE html> 1 -  <span>partial a1</span>1');
    })().catch(function (err) {
        console.log(err);
        test.ok(!err);
    });
});
