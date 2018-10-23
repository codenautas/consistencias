// import * as ExpresionParser from 'expre-parser';
import { Client } from 'pg-promise-strict';
// import { ConsistenciasPk } from './server/types-consistencias';

abstract class BEPlusTable{
    
    constructor(public client:Client){
    }

    // static get(pkObj:{[key:string]: any}){
    //     //traer desde DB
    //     let sql = 'select from ' + BEPlusTable.getTableName() + pkObj 
    //     //execute and return sql
    // }

    save(){
        // guardar en DB
        // let sql = 'UPDATE ' + BEPlusTable.getTableName()
        // execute update
    }

    static getTableName(): any {
    };
}


export class ConsistenciaTable extends BEPlusTable{
    static tableName = 'consistencias';

    operativo: string
    con: string
    precondicion: string
    postcondicion: string
    activa: boolean
    valida: boolean
    clausula_from: string
    expresion_sql: string
    error_compilacion: string

    // static get(pkObj:ConsistenciasPk){
        // BEPlusTable.get(pkObj);
    // }
}

export class Consistencia extends ConsistenciaTable{

    /* responsabilidades:
        chequear que todas las variables de la pre y post existan en alguna tabla (sino se llena el campo error_compilacion)
        chequear que la expresiones (pre y post) sea correcta (corriendo un select simple para ver si falla postgres)
        Agrega registros que correspondan en con_var para esta consistencia
        marca la consistencia como válida */
    compilar(){
        // limpieza
        this.valida = false;
        //limpiar todas con_var
        //persistir

        // chequear que todas las variables de la pre y post existan en alguna tabla (sino se llena el campo error_compilacion)
            // extraer variables con expre parser
            // let involvedVars = ExpresionParser.parse(this.precondicion + ' ' + this.postcondicion).getInsumos().variables;
            

        // armar select para test
        // let getPassPrecond = 'select * from personas where ' + con.precondicion + ' and not ' + con.postcondicion
        //'select * from personas where personas.p3<6 and not personas.p6<>2'

        // si pasa test 
            // this.valida = true
            // Agrega registros que correspondan en con_var para esta consistencia
            // llena campos clausula_from y expresion_sql de consistencia
        // sino
            // carga campo error_compilacion
        
        // persiste todo
        this.save();
    }
}