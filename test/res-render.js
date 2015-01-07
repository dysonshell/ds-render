'use strict';
var tape = require('tape');
var app = require('./example')();
var request = require('supertest');

app.get('/a', function (req, res) {
    res.render();
});
app.get('/b', function (req, res) {
    res.render('a');
});
app.get('/b_with_rushheads', function (req, res) {
    res.render('a', {
        rushHeads: ['<!doctype html>']
    });
});
app.use(require('../')
    .middleware());

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

tape('partial/b_with_rushheads', function (test) {
    test.plan(2);
    request(app)
        .get('/b_with_rushheads')
        .expect(200)
        .end(function (err, res) {
            test.notOk(err);
            test.equal(res.text.trim(), '<!doctype html>partial a');
        });
});