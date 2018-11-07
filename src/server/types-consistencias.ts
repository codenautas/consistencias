import { OperativoGenerator } from 'operativos';
import { Client } from 'pg-promise-strict';
import * as EP from "expre-parser";

export * from 'operativos';

export abstract class ConsistenciaDB{
    operativo:string
    con: string
    precondicion: string
    postcondicion: string
    activa: boolean
    clausula_from: string
    expresion_sql: string
    campos_pk: string
    error_compilacion: string
    valida: boolean
    explicacion: string
    falsos_positivos: boolean
    momento: string
    tipo: string
    modulo: string
    observaciones: string
    variables_de_contexto: string
    compilada: Date
}

export class Consistencia extends ConsistenciaDB{

    static async fetchAll(client: Client):Promise<Consistencia[]>{
        let result = await client.query(`
            SELECT td.*, r.que_busco, to_jsonb(array_agg(v.variable order by v.orden)) pks
                FROM tabla_datos td 
                    LEFT JOIN relaciones r ON td.operativo=r.operativo AND td.tabla_datos=r.tabla_datos AND r.tipo <> 'opcional' 
                    LEFT JOIN variables v ON td.operativo=v.operativo AND td.tabla_datos=v.tabla_datos AND v.es_pk > 0
                GROUP BY td.operativo, td.tabla_datos, r.que_busco`
            , []).fetchAll();
        return <Consistencia[]> result.rows.map((con:Consistencia) => Object.setPrototypeOf(con, Consistencia.prototype));
    }

    /**chequear que todas las variables de la pre y post existan en alguna tabla (sino se llena el campo error_compilacion)
    chequear que la expresiones (pre y post) sea correcta (corriendo un select simple para ver si falla postgres) 
    marca la consistencia como válida 
    */
    validate(): boolean{
        this.cleanConVar();
        //limpiar todas con_var // ¿ <<-- por que dijimos eso ? ¿no debería limpiarlas solo si es válida?
        //persistir

        return this.checkPreAndPostCond() && await this.checkCondSql();
        
        
    }
    
    // armar select para test
    async checkCondSql(): boolean {
        // let getPassPrecond = 'select * from personas where ' + con.precondicion + ' and not ' + con.postcondicion
        //'select * from personas where personas.p3<6 and not personas.p6<>2'
    }

    
    checkPreAndPostCond(): boolean {
        return this.checkPreCond() && this.checkPostCond();
    }

    // chequear que todas las variables de la cond existan en alguna tabla (sino se llena el campo error_compilacion)
    checkCond(condition: string): boolean{
        // extraer variables con expre parser
        let involvedVars = EP.parse(this.precondicion + ' ' + this.postcondicion).getInsumos().variables;

    }

    checkPostCond(): booblean {
        return this.checkCond(this.precondicion);
    }
    checkPreCond(): booblean {
        return this.checkCond(this.postcondicion);
    }

    cleanConVar(): any {
        throw new Error("Method not implemented.");
    }

    // Agrega registros que correspondan en con_var para esta consistencia generar sql para FROM WHERE y el pedazo de clave
    generateSql(){
        // Agrega registros que correspondan en con_var para esta consistencia
            // llena campos clausula_from y expresion_sql de consistencia
        // sino
            // carga campo error_compilacion
        
        // persiste todo
        //this.save();
    }

    // responsabilidades: chequear que sea valida y generar el sql 
    compilar(){
        if (this.validate()){
            this.generateSql();
        }      
    }

    correr(){
        if (!this.valida){
            throw new Error('La consistencia ' + this.con + ' debe haber compilado exitosamente');
        }
    }
}

export class ConsistenciasGenerator extends OperativoGenerator{
    myCons: Consistencia[]

    constructor(operativo: string) {
        super(operativo);
    }

    async fetchDataFromDB(client: Client) {
        await super.fetchDataFromDB(client);
        this.myCons = await Consistencia.fetchAll(client);
    }

}