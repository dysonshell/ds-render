'use strict';
var path = require('path');
var tape = require('tape');
var app = require('express')();
var request = require('supertest');
console.log(require('../'));
require('../')
    .argmentApp(app, {
        appRoot: path.join(__dirname, 'partials'),
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
            test.equal(res.text.trim(), 'partial a');
            if (err) throw err;
        });
});

tape('partial/deep', function (test) {
    test.plan(2);
    request(app)
        .get('/deep')
        .expect(200)
        .end(function (err, res) {
            test.notOk(err);
            test.equal(res.text.trim(), 'deep partial');
            if (err) throw err;
        });
});