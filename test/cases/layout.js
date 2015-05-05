'use strict';
var tape = require('tape');
var app = require('../example');
var request = require('supertest');

app.get('/a', function (req, res) {
    res.layout = 'layouts/default';
    res.render();
});
app.get('/b', function (req, res) {
    res.layout = 'layouts/b';
    res.render('a');
});
app.get('/err', function (req, res, next) {
    next(new Error('TEST_ERR_TMPL'));
});
require('../../')(app);

tape('partial/a with layout', function (test) {
    test.plan(2);
    request(app)
        .get('/a')
        .expect(200)
        .end(function (err, res) {
            test.notOk(err);
            test.equal(res.text.trim(), '<!DOCTYPE html><!-- comments kept --><title>hello</title><div id="main-container">partial a</div>');
        });
});

tape('partial/b with layout' , function (test) {
    test.plan(2);
    request(app)
        .get('/b')
        .expect(200)
        .end(function (err, res) {
            test.notOk(err);
            test.equal(res.text.trim(), '<!DOCTYPE html><!-- hello from b --><div id="main-container">partial a</div>');
        });
});
