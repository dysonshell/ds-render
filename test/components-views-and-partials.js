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

tape('when global view and components view name conflicts, ' +
    'always solve to components view. and components scope ' +
    'partials should be supported',
    function (test) {
        test.plan(2);
        request(app)
            .get('/ccc')
            .expect(200)
            .end(function (err, res) {
                test.notOk(err);
                test.equal(res.text.trim(), 'partial in testc');
            });
    });

tape('also support res.viewPath, treat exactly like req.path',
    function (test) {
        test.plan(2);
        request(app)
            .get('/cccc')
            .expect(200)
            .end(function (err, res) {
                test.notOk(err);
                test.equal(res.text.trim(), 'partial in testc');
            });
    });