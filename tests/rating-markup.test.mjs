import test from 'node:test';import assert from 'node:assert/strict';
import {stars,cardRating} from '../public/rating-markup.mjs';
test('cards show explicit empty state, real average and count, and demo labels only when requested',()=>{assert.equal((stars(4).match(/<svg/g)||[]).length,5);assert.match(cardRating({id:'fries-salt'}),/Még nincs/);const real=cardRating({id:'fries-salt',reviewAverage:4.5,reviewCount:12});assert.match(real,/4,5/);assert.match(real,/12/);assert.ok(!real.includes('DEMO'));assert.match(cardRating({id:'fries-salt'},true),/DEMO/);});
