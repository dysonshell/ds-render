'use strict';
var tape = require('tape');
var app = require('../example')();
var request = require('supertest');

app.get('/a', function (req, res) {
    res.render();
});
app.get('/b', function (req, res) {
    res.render('a');
});
app.use(app.dsRenderMiddleware);

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
