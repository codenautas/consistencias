"use strict";

import * as operativos from "operativos";
import { procedures } from "./procedures-consistencias";
import { con_var} from "./table-con_var";
import { consistencias } from "./table-consistencias";

export * from "./types-consistencias";

export function emergeAppConsistencias<T extends operativos.Constructor<operativos.AppOperativosType>>(Base:T){
    
    return class AppConsistencias extends Base{
        constructor(...args:any[]){ 
            super(args);
            this.allProcedures = this.allProcedures.concat(procedures);
            this.allClientFileNames.push({type:'js', module: 'consistencias', modPath: '../client', file: 'consistencias.js', path: 'client_modules'})
            // this.allClientFileNames.push({type:'js', src: 'client/consistencias.js' })
        }

        getMenu():operativos.MenuDefinition{
            //TODO: es igual que en datos-ext llevarlo a operativos
            let myMenuPart: operativos.MenuInfo[] = [
                {
                    menuType: 'menu', name: 'Consistencias', menuContent: [
                        { menuType: 'table', name: 'consistencias' },
                        { menuType: 'table', name: 'inconsistencias' },
                        { menuType: 'table', name: 'con_var' },
                        { menuType: 'table', name: 'in_con_var' },
                    ]
                }
            ];
            return {menu: super.getMenu().menu.concat(myMenuPart)}
        }

        prepareGetTables(){
            //TODO: es igual que en datos-ext llevarlo a operativos
            super.prepareGetTables();
            this.getTableDefinition={
                ...this.getTableDefinition,
                consistencias,
                con_var
            }
            this.appendToTableDefinition('operativos', function(tableDef){
                tableDef.fields.push(
                    {name: "compilar-con" , typeName: "bigint"  , editable:false, clientSide:'compilar', title: 'compilar con'},
                    {name: "correr-con"   , typeName: "bigint"  , editable:false, clientSide:'correr', title: 'correr con'}
                );
            });
        }
    }
}

export var AppConsistencias = emergeAppConsistencias(operativos.emergeAppOperativos(operativos.AppBackend));
export type AppConsistenciasType = InstanceType<typeof AppConsistencias>;
