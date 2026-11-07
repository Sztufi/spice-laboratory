import test from 'node:test';
import assert from 'node:assert/strict';
import {demoReviews} from '../public/reviews-demo.mjs';
test('demo reviews are labelled fictional, not eligible, and filter/sort without changing fixtures',()=>{
 const d=demoReviews();assert.equal(d.count,3);assert.equal(d.average,4);assert.equal(d.eligible,false);assert.ok(d.reviews.every(v=>v.text.includes('kitalált')));
 assert.deepEqual(demoReviews(4).reviews.map(v=>v.rating),[4]);assert.deepEqual(demoReviews(0,'lowest').reviews.map(v=>v.rating),[3,4,5]);assert.equal(demoReviews().reviews[0].rating,5);
});
