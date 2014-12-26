'use strict';
var path = require('path');
var tape = require('tape');
var app = require('./example')();
var request = require('supertest');

app.use(require('../')
    .middleware());

tape(
    "/assets/js/lib.js should be replaced with scripts specified " +
    "in lib.json, and more than one lib.js script tag will be removed",
    function (test) {
        //        test.plan(2);
        request(app)
            .get('/libjs')
            .expect(200)
            .end(function (err, res) {
                test.notOk(err);

                var libs = require('./example/assets/js/lib.json');
                libs.forEach(function (lib) {
                    var expect = path.resolve("/assets/js", lib);
                    test.ok(res.text.match(new RegExp(
                        "<script\\s+src=['\"]" + expect +
                        "['\"]><\\/script>", "ig")));
                });

                test.equal(res.text.match(/script/g)
                    .length, libs.length * 2);

                test.end();
            });
    });