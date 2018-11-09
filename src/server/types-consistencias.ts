import * as EP from "expre-parser";
import { OperativoGenerator, Variable, prefijarExpresion, getWrappedExpression, compilerOptions } from 'varcal';
import { Client } from 'pg-promise-strict';

export * from 'varcal';

export abstract class ConsistenciaDB {
    operativo: string
    con: string
    precondicion: string
    postcondicion: string
    activa: boolean
    clausula_from: string
    clausula_where: string
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

export class Consistencia extends ConsistenciaDB {

    insumosVars: Variable[];
    client: Client;
    condInsumos: EP.Insumos;
    opGen: OperativoGenerator;

    static async fetchOne(client: Client, op: string, con: string): Promise<Consistencia> {
        let result = await client.query(`SELECT * FROM consistencias c WHERE c.operativo = $1 AND c.con = $2`, [op, con]).fetchUniqueRow();
        return Object.assign(new Consistencia(), result.row);
    }

    static async fetchAll(client: Client): Promise<Consistencia[]> {
        let result = await client.query(`
            SELECT td.*, r.que_busco, to_jsonb(array_agg(v.variable order by v.orden)) pks
                FROM tabla_datos td 
                    LEFT JOIN relaciones r ON td.operativo=r.operativo AND td.tabla_datos=r.tabla_datos AND r.tipo <> 'opcional' 
                    LEFT JOIN variables v ON td.operativo=v.operativo AND td.tabla_datos=v.tabla_datos AND v.es_pk > 0
                GROUP BY td.operativo, td.tabla_datos, r.que_busco`
            , []).fetchAll();
        return <Consistencia[]>result.rows.map((con: Consistencia) => Object.setPrototypeOf(con, Consistencia.prototype));
    }

    async validate(): Promise<void> {
        this.validateInsumosPreAndPostCond();
        await this.validateCondSql();
    }

    //chequear que la expresiones (pre y post) sea correcta (corriendo un select simple para ver si falla postgres) 
    async validateCondSql() {
        let insumosTDNames:string[] = this.insumosVars.map(v=>v.tabla_datos);
        
        // TODO: ORDENAR:
        // primero: la td que no tenga ninguna TD en que busco es la principal
        // segundas: van todas las tds que tengan en "que_busco" a la principal
        // terceras: las tds que tengan en "que busco" a las segundas
        insumosTDNames = ['grupo_personas', 'grupo_personas_calculada', 'personas', 'personas_calculadas']
        let mainTD = this.opGen.getTD(insumosTDNames[0]);
        let lastTD = this.opGen.getTD(insumosTDNames[insumosTDNames.length-1]);
        this.clausula_from = 'FROM '+ mainTD.getTableName();

        for(let i=1; i < insumosTDNames.length; i++){
            let leftInsumoTDName = insumosTDNames[i-1];
            let rightInsumoTDName = insumosTDNames[i];
            this.clausula_from += this.opGen.joinTDs(leftInsumoTDName, rightInsumoTDName);
        }
        
        this.precondicion = getWrappedExpression(this.precondicion, lastTD.getPKCSV(), compilerOptions);
        this.postcondicion = getWrappedExpression(this.postcondicion, lastTD.getPKCSV(), compilerOptions);

        prefijarExpresion(this.precondicion, EP.parse(this.precondicion).getInsumos(), this.opGen.myVars)
        prefijarExpresion(this.postcondicion, EP.parse(this.postcondicion).getInsumos(), this.opGen.myVars)

        this.clausula_where = `WHERE (${this.precondicion}) AND (${this.postcondicion}) IS NOT TRUE`;
        let selectQuery = `SELECT true 
                            ${this.clausula_from}
                            ${this.clausula_where}
                            limit 1`;
        await this.client.query(selectQuery, []).fetchOneRowIfExists;
    }

    // chequear que todas las variables de la cond existan en alguna tabla (sino se llena el campo error_compilacion)
    validateInsumosPreAndPostCond(): void {    
        this.condInsumos = EP.parse(this.precondicion + ' ' + this.postcondicion).getInsumos();
        this.validateFunctions(this.condInsumos.funciones);
        this.validateVars(this.condInsumos.variables);
    }

    throwError(specificError: string) {
        throw new Error(`La consistencia "${this.con}" del operativo ${this.opGen.operativo} es inválida. ` + specificError);
    }

    //TODO: ADD PREFIJOS!!
    validateVars(varNames: string[]): void {
        let operativoGenerator = this.opGen;
        varNames.forEach(varName => {
            let varsFound = operativoGenerator.myVars.filter(v => v.variable == varName);
            if (varsFound.length > 1) {
                this.throwError('La variable ' + varName + ' se encontró mas de una vez en las siguientes tablas de datos: ' + varsFound.map(v => v.tabla_datos).join(', '));
            } else if (varsFound.length <= 0) {
                this.throwError('La variable ' + varName + ' no se encontró en la lista de variables');
            } else {
                let varFound = varsFound[0];
                if (!varFound.activa){this.throwError('La variable ' + varName + ' no está activa.');}
                this.insumosVars.push(varFound);
            }
        });

        // TODO:
        // y si tiene alias ver que esten en relaciones
        // si la variable está prefijada con un alias -> que esté el prefijo
    }

    validateFunctions(funcNames: string[]) {
        let pgWitheList = ['div', 'avg', 'count', 'max', 'min', 'sum', 'coalesce'];
        let userWhiteList = ['informado', 'dic_tradu'];
        let whiteList = pgWitheList.concat(userWhiteList);
        funcNames.forEach(f => {
            if (whiteList.indexOf(f) == -1) {
                throw new Error('La Función ' + f + ' no está incluida en la whiteList de funciones: ' + whiteList.toString());
            }
        })
    }
        
    cleanConVar(): any {
        this.insumosVars=[];
        //TODO:  clean convars in DB
        // await
    }

    // Agrega registros que correspondan en con_var para esta consistencia generar sql para FROM WHERE y el pedazo de clave
    updateConsistencia() {
        this.valida = true; //pass validation then is valid
        this.campos_pk = 'asdfs'
        // this.clausula_where = [];
        // llena campos clausula_from y clausula_where de consistencia
    }
    
    // responsabilidades: chequear que sea valida y generar el sql 
    async compilar(client: Client) {
        this.client = client;
        this.opGen = OperativoGenerator.instanceObj;
        //TODO: cuando se compile en masa sacar este fetchall a una clase Compilador que lo haga una sola vez
        try {
            await this.validate();
            await this.updateDB();
        } catch (error) {
            this.cleanDB();
            this.error_compilacion = (<Error>error).message;
            // TODO agregar error genérico de consistencia que falló aún cuando falle por postgres (en la ejecución del select)
            throw error;
        }finally{
            await this.save();
        }
    }
    save(): any {
        throw new Error("Method not implemented.");
    }
    cleanDB(): any {
        this.cleanConsistencia();
        this.cleanConVar();
    }
    private cleanConsistencia() {
        this.valida = false;
        this.clausula_from = this.clausula_where = this.campos_pk = '';
    }

    async updateDB(): Promise<any> {
        this.updateConsistencia();
        this.insertConVars();
    }
    async insertConVars(): Promise<any> {
        // Agrega registros que correspondan en con_var para esta consistencia
        //insert en tabla convar -> this.insumosVars
    }

    correr() {
        if (!this.valida) {
            throw new Error('La consistencia ' + this.con + ' debe haber compilado exitosamente');
        }
    }
}

export class ConsistenciasGenerator extends OperativoGenerator {
    myCons: Consistencia[]

    constructor(operativo: string) {
        super(operativo);
    }

    async fetchDataFromDB(client: Client) {
        await super.fetchDataFromDB(client);
        this.myCons = await Consistencia.fetchAll(client);
    }

}