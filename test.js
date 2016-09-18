"use strict";

const assert = require('chai').assert;
const h265ize = require('./h265ize');

const testVideoPath = 'test/trailer.webm';

let Encoder, Video;
describe('Encoder', function() {
    this.timeout(1000);
    it('should return an instance of Encoder', function() {
        assert.instanceOf(Encoder = new h265ize.Encoder(), h265ize.Encoder, 'new h265ize.Encoder() did not return an instance of h265ize.Encoder');
    });
    it('should add a video by path', function() {
        assert.includeDeepMembers(Encoder.queue, [Encoder.addVideo(testVideoPath)], 'video not added');
    });
    it('should start', function() {
        assert.ifError(Encoder.start());
        assert.isTrue(Encoder.running, 'encoder did not start');
    });
    it('should pause', function() {
        assert.ifError(Encoder.pause());
        assert.isTrue(Encoder.paused, 'encoder did not pause');
    });
    it('should resume', function() {
        assert.ifError(Encoder.resume());
        assert.isFalse(Encoder.paused, 'encoder is still paused');
    });
    it('should stop', function() {
        assert.ifError(Encoder.stop());
        assert.isFalse(Encoder.running, 'encoder is still running');
    });
});
describe('Video', function() {
    this.timeout(1000);
    it('should return an instance of Video', function() {
        assert.instanceOf(Video = new h265ize.Video(testVideoPath), h265ize.Video, 'new h265ize.Encoder() is not an instance of h265ize.Encoder');
    });
    it('should add video to encoder', function() {
        Encoder.addVideo(Video);
        assert.includeDeepMembers(Encoder.queue, [Video], 'video not added');
    });
    it('should start', function() {
        assert.ifError(Video.start());
        assert.isTrue(Video.running, 'video did not start');
    });
    it('should pause', function() {
        assert.ifError(Video.pause());
        assert.isTrue(Video.paused, 'video did not pause');
    });
    it('should resume', function() {
        assert.ifError(Video.resume());
        assert.isFalse(Video.paused, 'video is still paused');
    });
    it('should stop', function() {
        assert.ifError(Video.stop());
        assert.isFalse(Video.running, 'video is still running');
    });
});