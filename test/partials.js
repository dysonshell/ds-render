'use strict';
var path = require('path');
var tape = require('tape');
var app = require('express')();
app.set('views', path.join(__dirname, 'example', 'views'));
var request = require('supertest');

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
            if (err) {
                console.error(err);
            }
            test.notOk(err);
            test.equal(res.text.trim(), 'partial a');
        });
});

tape('partial/deep', function (test) {
    test.plan(2);
    request(app)
        .get('/deep')
        .expect(200)
        .end(function (err, res) {
            if (err) {
                console.error(err);
            }
            test.notOk(err);
            test.equal(res.text.trim(), 'deep partial');
        });
});