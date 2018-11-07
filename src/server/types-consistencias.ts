import * as EP from "expre-parser";
import { OperativoGenerator } from 'operativos';
import { Client } from 'pg-promise-strict';

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
    static async fetchOne(client:Client, op: string, con: string): Promise<Consistencia> {
        let result = await client.query(`SELECT * FROM consistencias c WHERE c.operativo = $1 AND c.con = $2`, [op, con]).fetchUniqueRow();
        return Consistencia.castTo(<Consistencia>result.row, Consistencia);
    }
    static castTo(row: Consistencia, t:any){//Consistencia: typeof Consistencia): any {
        Object.setPrototypeOf(row, t);
        return row;
    }

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
    async validate(): Promise<void>{
        this.cleanConVar();
        this.validatePreAndPostCond();
        await this.validateCondSql();
    }
    
    // armar select para test
    async validateCondSql(): Promise<boolean> {
        // let getPassPrecond = 'select * from personas where ' + con.precondicion + ' and not ' + con.postcondicion
        //'select * from personas where personas.p3<6 and not personas.p6<>2'
        return true;
    }

    validatePreAndPostCond(): void {
        this.validatePreCond()
        this.validatePostCond();
    }

    // chequear que todas las variables de la cond existan en alguna tabla (sino se llena el campo error_compilacion)
    validateCond(cond: string){
        let condInsumos = EP.parse(cond).getInsumos();
        this.validateFunctions(condInsumos.funciones);
        // this.validateVars(condInsumos.variables);
    }
    
    // validateVars(vars: string[]): void {
        // vars.forEach(varName=>{
        //     // let vv = Variable.fetchAll;
        //     // if (! vv.activa){
        //     //     throw new Error('La variable '+ vv.variable +' debe estar activa');
        //     // }
        // });
        // por cada var involucrada en la condición
            //check:
            // activa; que existe en tabla variable

        
        // ver que esten en la tabla variables
        // y si tiene alias ver que esten en relaciones
        // si la variable está prefijada con un alias -> que esté el prefijo
    // }
    validateFunctions(funcNames:string[]) {
        let whiteList = ['div', 'avg', 'count', 'max', 'min', 'sum', 'coalesce'];
        funcNames.forEach(f=> {
            if(whiteList.indexOf(f) == -1){
                throw new Error('La Función ' + f + ' no está incluida en la whiteList de funciones: ' + whiteList.toString());
            }
        })
    }

    validatePostCond(): void {
        return this.validateCond(this.precondicion);
    }
    validatePreCond(): void {
        return this.validateCond(this.postcondicion);
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
    async compilar(){
        await this.validate()
        this.generateSql();
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