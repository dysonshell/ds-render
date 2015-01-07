'use strict';
var path = require('path');
var tape = require('tape');
var app = require('./example')();
var request = require('supertest');

app.get('/b', function (req, res, next) {
    res.viewPath = 'a';
    next();
});

app.use(require('../')
    .middleware());

require('../')
    .argmentApp(app, {
        appRoot: path.join(__dirname, 'example'),
        assetsDirName: 'assets',
        viewsDirName: 'views'
    });

tape('partial/a', function (test) {
    test.plan(2);
    request(app)
        .get('/a')
        .expect(200)
        .end(function (err, res) {
            test.notOk(err);
            test.equal(res.text.trim(), '<!doctype html>partial a');
        });
});


tape('partial/b', function (test) {
    test.plan(2);
    request(app)
        .get('/b')
        .expect(200)
        .end(function (err, res) {
            test.notOk(err);
            test.equal(res.text.trim(), '<!doctype html>partial a');
        });
});
