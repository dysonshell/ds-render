'use strict';
var path = require('path');
process.env.NODE_CONFIG_DIR = path.resolve(__dirname, '..', 'example', 'config');
var tape = require('tape');
var app = require('../example');
var request = require('supertest');

app.get('/a', function (req, res) {
    res.render();
});
app.get('/b', function (req, res) {
    res.render('a');
});
app.get('/err', function (req, res, next) {
    next(new Error('TEST_ERR_TMPL'));
});
require('../../')(app);

tape('partial/a', function (test) {
    test.plan(2);
    request(app)
        .get('/a')
        .expect(200)
        .end(function (err, res) {
            test.notOk(err);
            test.equal(res.text.trim(), 'partial a');
        });
});

tape('partial/b', function (test) {
    test.plan(2);
    request(app)
        .get('/b')
        .expect(200)
        .end(function (err, res) {
            test.notOk(err);
            test.equal(res.text.trim(), 'partial a');
        });
});

tape('not found', function (test) {
    test.plan(2);
    request(app)
        .get('/cc')
        .expect(404)
        .end(function (err, res) {
            test.notOk(err);
            test.equal(res.text.trim(), 'hello 404');
        });
});

tape('err page', function (test) {
    test.plan(2);
    request(app)
        .get('/err')
        .expect(500)
        .end(function (err, res) {
            test.notOk(err);
            test.equal(res.text.trim(), 'error 500');
        });
});

tape('conflict', function (test) {
    test.plan(2);
    request(app)
        .get('/ccc')
        .expect(500)
        .end(function (err, res) {
            test.notOk(err);
            test.equal(res.text.trim().indexOf('<!doctype html><h1>找到对应的多个模版</h1>'), 0);
        });
});
