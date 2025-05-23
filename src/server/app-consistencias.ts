"use strict";

import { AppBackend, AppVarCalType, emergeAppOperativos, emergeAppVarCal, Constructor, MenuDefinition, MenuInfo, Request, OptsClientPage, AppConfig } from "varcal";
import { procedures } from "./procedures-consistencias";
import { momentos_consistencia } from "./table-momentos_consistencia";
import { consistencias } from "./table-consistencias";
import { con_var } from "./table-con_var";
import { inconsistencias } from "./table-inconsistencias";
import { inconsistencias_ultimas } from "./table-inconsistencias_ultimas";
import { in_con_var } from "./table-in_con_var";
import {defConfig} from "./def-config";

export * from "./types-consistencias";

export var disableVarcal:boolean=false;

export interface ConsistenciasAppConfig extends AppConfig {
    disableVarcal: boolean;
}

export function emergeAppConsistencias<T extends Constructor<AppVarCalType>>(Base:T){
    
    return class AppConsistencias extends Base{
        declare config: ConsistenciasAppConfig;

        constructor(...args:any[]){ 
            super(args);
        }

        async getProcedures(){
            var parentProc = await super.getProcedures()
            return parentProc.concat(procedures);
        }

        clientIncludes(req:Request, hideBEPlusInclusions:OptsClientPage){
            return super.clientIncludes(req, hideBEPlusInclusions).concat([
                {type:'js', module: 'consistencias', modPath: '../client', file: 'consistencias.js', path: 'client_modules'}
            ])
        }

        configStaticConfig(){
            super.configStaticConfig();
            this.setStaticConfig(defConfig);
        }
        getMenu():MenuDefinition{
            let myMenuPart: MenuInfo[] = [
                {
                    menuType: 'menu', name: 'consistencias', menuContent: [
                        { menuType: 'table', name: 'consistencias' },
                        { menuType: 'table', name: 'inconsistencias' },
                        { menuType: 'table', name: 'con_var' },
                        { menuType: 'table', name: 'in_con_var' },
                    ]
                }
            ];
            return {menu: super.getMenu().menu.concat(myMenuPart)}
        }

        async postConfig(){
            await super.postConfig();
            disableVarcal = this.config.disableVarcal;
        }

        prepareGetTables(){
            super.prepareGetTables();
            this.getTableDefinition={
                ...this.getTableDefinition,
                momentos_consistencia,
                consistencias,
                con_var,
                inconsistencias,
                inconsistencias_ultimas,
                in_con_var
            }
            this.appendToTableDefinition('operativos', function(tableDef){
                tableDef.fields.push(
                    {name: "compilar_cons", typeName: "bigint"  , editable:false, clientSide:'compilarTodas', title: 'compilar consistencias'},
                    {name: "correr_cons"  , typeName: "bigint"  , editable:false, clientSide:'correrTodas', title: 'correr consistencias'}
                );
            });
            this.appendToTableDefinition('variables', function(tableDef){
                if (!tableDef.detailTables) {
                    tableDef.detailTables = [];
                }
                tableDef.detailTables.push({ table: 'con_var', fields: ['operativo', 'variable'], abr: 'C', label: 'consistencias' });
            });
        }
    }
}

export var AppConsistencias = emergeAppConsistencias(emergeAppVarCal(emergeAppOperativos(AppBackend)));
export type AppConsistenciasType = InstanceType<typeof AppConsistencias>;
