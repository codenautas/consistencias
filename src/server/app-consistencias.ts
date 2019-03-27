"use strict";

import { AppBackend, AppVarCalType, emergeAppOperativos, emergeAppVarCal, Constructor, MenuDefinition } from "varcal";
import { procedures } from "./procedures-consistencias";
import { consistencias } from "./table-consistencias";
import { con_var } from "./table-con_var";
import { inconsistencias } from "./table-inconsistencias";
import { inconsistencias_ultimas } from "./table-inconsistencias_ultimas";
import { in_con_var } from "./table-in_con_var";
import {defConfig} from "./def-config";
import { MenuInfo } from "operativos";

export * from "./types-consistencias";

export function emergeAppConsistencias<T extends Constructor<AppVarCalType>>(Base:T){
    
    return class AppConsistencias extends Base{
        constructor(...args:any[]){ 
            super(args);
            this.allProcedures = this.allProcedures.concat(procedures);
            this.allClientFileNames.push({type:'js', module: 'consistencias', modPath: '../client', file: 'consistencias.js', path: 'client_modules'})
            // this.allClientFileNames.push({type:'js', src: 'client/consistencias.js' })
        }
        configStaticConfig(){
            super.configStaticConfig();
            this.setStaticConfig(defConfig);
        }
        getMenu():MenuDefinition{
            let myMenuPart: MenuInfo[] = [
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
            super.prepareGetTables();
            this.getTableDefinition={
                ...this.getTableDefinition,
                consistencias,
                con_var,
                inconsistencias,
                inconsistencias_ultimas,
                in_con_var
            }
            this.appendToTableDefinition('operativos', function(tableDef){
                tableDef.fields.push(
                    {name: "compilar_cons" , typeName: "bigint"  , editable:false, clientSide:'compilarTodas', title: 'compilar consistencias'}
                );
            });
        }
    }
}

export var AppConsistencias = emergeAppConsistencias(emergeAppVarCal(emergeAppOperativos(AppBackend)));
export type AppConsistenciasType = InstanceType<typeof AppConsistencias>;
