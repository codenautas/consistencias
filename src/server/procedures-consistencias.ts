"use strict";

var procedures = [
    {
        action:'base/consistir',
        parameters:[
            {name:'operativo'  , typeName:'text', references:'operativos'},
        ],
        coreFunction:async function(){
            //var be = context.be as AppConsistenciasType;
        }
    },   
];

export {procedures};
