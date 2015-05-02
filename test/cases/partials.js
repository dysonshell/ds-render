'use strict';
var tape = require('tape');
var app = require('../example')();
var request = require('supertest');

app.use(app.dsRenderMiddleware);

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
            test.equal(res.text.trim(), 'deep partial partial in testc tc.d');
        });
});
