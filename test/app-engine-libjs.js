'use strict';
var path = require('path');
var tape = require('tape');
var app = require('express')();
var request = require('supertest');

app.get('/cccc', function (req, res, next) {
    res.viewPath = '/ccc';
    next();
});

require('../')
    .argmentApp(app, {
        appRoot: path.join(__dirname, 'example'),
        assetsDirName: 'assets',
        viewsDirName: 'views'
    });

tape("/assets/js/lib.js should be replaced with scripts specified in lib.json",
    function (test) {
        test.plan(2);
        request(app)
            .get('/libjs')
            .expect(200)
            .end(function (err, res) {
                test.notOk(err);

                var libs = require('./example/assets/js/lib.json');
                test.equal(res.text.match(/script/g)
                    .length, libs.length * 2);
            });
    });