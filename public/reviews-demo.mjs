// UI fixtures only. Never sent to the review API or included in real aggregates.
export function demoReviews(rating=0,sort='recent'){
 const samples=[
 {rating:5,name:'Minta vásárló A',text:'Ez egy kitalált mintavélemény. Sütőben sült krumplin próbáltam: kellemesen füstös, és kevés is elég belőle.',date:'2026-11-07T09:00:00Z'},
 {rating:4,name:'Minta vásárló B',text:'Ez egy kitalált mintavélemény. Jó ízt ad a burgonyának. Nekem kicsit sósabb a megszokottnál, ezért legközelebb kevesebbet használok.',date:'2026-11-06T09:00:00Z'},
 {rating:3,name:'Minta vásárló C',text:'Ez egy kitalált mintavélemény. A füstös karakter nem teljesen az én világom, de a családban volt, akinek nagyon bejött.',date:'2026-11-05T09:00:00Z'}
 ];
 const reviews=samples.filter(v=>!Number(rating)||v.rating===Number(rating));
 if(sort==='lowest')reviews.sort((a,b)=>a.rating-b.rating);
 if(sort==='highest')reviews.sort((a,b)=>b.rating-a.rating);
 return {count:3,average:4,counts:[0,0,1,1,1],reviews,eligible:false,authenticated:false,mine:null,hasMore:false};
}
