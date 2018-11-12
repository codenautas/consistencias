import * as EP from "expre-parser";
import { OperativoGenerator, Variable, prefijarExpresion, getWrappedExpression, compilerOptions } from 'varcal';
import { Client } from 'pg-promise-strict';

export * from 'varcal';

export class ConVarDB{
    operativo: string
    con: string
    variable: string
    tabla_datos: string
    texto: string
}

export class ConVar extends ConVarDB{

}

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

    async validateAndPreBuild(): Promise<void> {
        this.validateInsumosPreAndPostCond();
        await this.validateCondSql();
        // pass all validations then complete this consistence to save afterwards
        this.compilada = OperativoGenerator.getTodayForDB();
        this.valida = true;
    }

    //chequear que la expresiones (pre y post) sea correcta (corriendo un select simple para ver si falla postgres) 
    async validateCondSql() {
        // TODO: ORDENAR dinamicamente:
        // primero: la td que no tenga ninguna TD en que busco es la principal
        // segundas: van todas las tds que tengan en "que_busco" a la principal
        // terceras: las tds que tengan en "que busco" a las segundas
        // provisoriamente se ordena fijando un arreglo ordenado
        let orderedTDNames = ['grupo_personas', 'grupo_personas_calculada', 'personas', 'personas_calculadas'];
        let insumosTDNames:string[] = this.insumosVars.map(v=>v.tabla_datos);
        let orderedInsumosTDNames:string[] = [];
        orderedTDNames.forEach(orderedTDName => {
            if(insumosTDNames.indexOf(orderedTDName) > -1){orderedInsumosTDNames.push(orderedTDName)}  
        });
        
        let mainTD = this.opGen.getTD(orderedInsumosTDNames[0]); //tabla mas general (padre)
        let lastTD = this.opGen.getTD(orderedInsumosTDNames[orderedInsumosTDNames.length-1]); //tabla mas específicas (padre)

        //calculo de campos_pk
        // TODO: agregar validación de funciones de agregación, esto es: si la consistencia referencia variables de tablas mas específicas (personas)
        // pero lo hace solo con funciones de agregación, entonces, los campos pk son solo de la tabla mas general, y no de la específica
        this.campos_pk = lastTD.getPKCSV();

        //calculo de clausula from
        this.clausula_from = 'FROM '+ mainTD.getTableName();
        for(let i=1; i < orderedInsumosTDNames.length; i++){
            let leftInsumoTDName = orderedInsumosTDNames[i-1];
            let rightInsumoTDName = orderedInsumosTDNames[i];
            this.clausula_from += this.opGen.joinTDs(leftInsumoTDName, rightInsumoTDName);
        }
        
        //calculo de clausula where
        this.precondicion = getWrappedExpression(this.precondicion, lastTD.getPKCSV(), compilerOptions);
        this.postcondicion = getWrappedExpression(this.postcondicion, lastTD.getPKCSV(), compilerOptions);
        prefijarExpresion(this.precondicion, EP.parse(this.precondicion).getInsumos(), this.opGen.myVars)
        prefijarExpresion(this.postcondicion, EP.parse(this.postcondicion).getInsumos(), this.opGen.myVars)
        this.clausula_where = `WHERE (${this.precondicion}) AND (${this.postcondicion}) IS NOT TRUE`;
        
        // execute select final para ver si pasa
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

    msgErrorCompilación(){
        return `La consistencia "${this.con}" del operativo ${this.opGen.operativo} es inválida. `;
    }

    //TODO: ADD PREFIJOS!! (alias)
    validateVars(varNames: string[]): void {
        let operativoGenerator = this.opGen;
        varNames.forEach(varName => {
            let varsFound = operativoGenerator.myVars.filter(v => v.variable == varName);
            if (varsFound.length > 1) {
                throw new Error('La variable ' + varName + ' se encontró mas de una vez en las siguientes tablas de datos: ' + varsFound.map(v => v.tabla_datos).join(', '));
            } else if (varsFound.length <= 0) {
                throw new Error('La variable ' + varName + ' no se encontró en la lista de variables');
            } else {
                let varFound = varsFound[0];
                if (!varFound.activa){throw new Error('La variable ' + varName + ' no está activa.');}
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
    
    // responsabilidades: chequear que sea valida y generar el sql 
    async compilar(client: Client) {
        this.client = client;
        this.opGen = OperativoGenerator.instanceObj;
        //TODO: cuando se compile en masa sacar este fetchall a una clase Compilador que lo haga una sola vez
        try {
            this.cleanAll();
            await this.validateAndPreBuild();
        } catch (error) {
            this.cleanAll(); //compilation fails then removes all generated data in validateAndPreBuild
            this.error_compilacion = this.msgErrorCompilación() + (<Error>error).message;
            throw new Error(this.error_compilacion);
        } finally {
            await this.updateDB();
        }
    }
    async save(): Promise<void> {
            
    }
    
    private cleanAll() {
        // clean consistencia
        this.valida = false;
        this.compilada = null;
        this.clausula_from = this.clausula_where = this.campos_pk = '';

        // clean con vars to insert
        this.insumosVars=[]; 
    }

    async updateDB(): Promise<any> {
        //update con_var query
        let conVarDelete = `DELETE FROM con_var WHERE opertivo=$1 AND con=$2;`;
        let conVarInserts = this.insumosVars.length < 1? '': `INSERT INTO con_var (operativo, con, variable, tabla_datos) VALUES 
            ${this.insumosVars.map(ivar=>`($1, $2,'${ivar.variable}','${ivar.tabla_datos}'),\n`)}`;

        //update consistencias query
        let fieldsToUpdate = ['compilada', 'valida', 'campos_pk', 'clausula_from', 'clausula_where', 'error_compilacion'];
        let be:any=this; //TODO: ver porque tuvimos que poner tipo any a 'be' para que no falle el map
        // en lugar de ='be[f]' usamos $i+3, el +3 es debido a que operativo=$1 y con=$2
        let conUpdate = `UPDATE consistencias SET 
            ${fieldsToUpdate.map((fieldName, index)=> `${fieldName}=$${index+3}`).join(', ')}
            WHERE operativo=$1 AND con=$2;`;
        let params=[this.operativo, this.con].concat(fieldsToUpdate.map(f=> be[f] ));

        //execute all query
        let queryParts = ['do $CONSIST_UPDATE$\n begin', conVarDelete, conVarInserts, conUpdate, 'end\n$CONSIST_UPDATE$']
        await this.client.query(queryParts.join('\n----\n'), params).execute();
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