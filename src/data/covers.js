// Dekkingen uit het 2D-spel.
export const COVERS=[
 {id:'man',name:'MAN',desc:'Iedereen een eigen man, één rusher. Sterk tegen korte routes.',m:[0,1,2,3,null],z:[null,null,null,null,null],r:[0,0,0,0,1]},
 {id:'c2',name:'COVER 2',desc:'Twee diep, twee in de flats, één rusher. Gat in het midden.',m:[null,null,null,null,null],z:[{d:5,y:4,R:6},{d:5,y:21,R:6},{d:14,y:18,R:9,deep:1},{d:14,y:7,R:9,deep:1},null],r:[0,0,0,0,1]},
 {id:'c3',name:'COVER 3',desc:'Twee kort, drie diep. Geen rusher: de QB heeft tijd, maar alles is gedekt.',m:[null,null,null,null,null],z:[{d:13,y:4,R:8,deep:1},{d:13,y:21,R:8,deep:1},{d:5,y:8,R:6},{d:15,y:12.5,R:9,deep:1},{d:5,y:17,R:6}],r:[0,0,0,0,0]},
 {id:'c4',name:'COVER 4',desc:'Vier diepe zones (quarters), één blitzer. Stopt de lange bal, kort open.',m:[null,null,null,null,null],z:[{d:12,y:3.5,R:7,deep:1},{d:12,y:21.5,R:7,deep:1},{d:12,y:15.5,R:7,deep:1},{d:12,y:9.5,R:7,deep:1},null],r:[0,0,0,0,1]},
 {id:'blitz',name:'BLITZ',desc:'Twee rushers op de QB, man erachter. De center staat vrij.',m:[0,1,null,2,null],z:[null,null,null,null,null],r:[0,0,1,0,1]}
];
