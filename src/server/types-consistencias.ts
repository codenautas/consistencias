import * as EP from "expre-parser";
import { Client } from 'pg-promise-strict';
import { compilerOptions, getWrappedExpression, OperativoGenerator, prefijarExpresion, Variable, AppOperativos } from 'varcal';

export * from 'varcal';

export class ConVarDB{
    operativo: string
    con: string
    variable: string
    tabla_datos: string
    texto: string
}

export class ConVar extends ConVarDB{
    static async fetchAll(client: Client, op: string, consistencia:string): Promise<ConVar[]> {
        let result = await client.query(`SELECT * FROM con_var c WHERE c.operativo = $1 AND c.con = $2`, [op, consistencia]).fetchAll();
        return <ConVar[]>result.rows.map((con: ConVar) => Object.setPrototypeOf(con, ConVar.prototype));
    }
}

export abstract class ConsistenciaDB {
    operativo: string
    con: string
    precondicion?: string
    postcondicion: string
    activa: boolean
    clausula_from?: string
    clausula_where?: string
    campos_pk?: string // se guardan las pks (con alias) de los TDs involucrados en los insumos
    error_compilacion?: string
    valida?: boolean
    explicacion?: string
    falsos_positivos?: boolean
    momento?: string
    tipo?: string
    modulo?: string
    observaciones?: string
    variables_de_contexto?: string
    compilada?: Date
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

    static async fetchAll(client: Client, op: string): Promise<Consistencia[]> {
        let result = await client.query(`SELECT * FROM consistencias c WHERE c.operativo = $1`, [op]).fetchAll();
        return <Consistencia[]>result.rows.map((con: Consistencia) => Object.setPrototypeOf(con, Consistencia.prototype));
    }

    async validateAndPreBuild(): Promise<void> {
        this.validatePreAndPostCond();
        this.validateCondInsumos();
        await this.validateCondSql();
        // pass all validations then complete this consistence to save afterwards
        this.compilada = new Date();
        this.valida = true;
    }

    validatePreAndPostCond(): any {
        // valida o "sanitiza" la pre cond
        if (this.precondicion){
            EP.parse(this.precondicion)
        }else{
            this.precondicion = 'true'
        }
        EP.parse(this.postcondicion)
    }

    //chequear que la expresiones (pre y post) sea correcta (corriendo un select simple para ver si falla postgres) 
    async validateCondSql() {
        // TODO: ORDENAR dinamicamente:
        // primero: la td que no tenga ninguna TD en que busco es la principal
        // segundas: van todas las tds que tengan en "que_busco" a la principal
        // terceras: las tds que tengan en "que busco" a las segundas
        // provisoriamente se ordena fijando un arreglo ordenado
        // TODO: deshardcodear main TD
        let mainTD = 'grupo_personas';
        let orderedTDNames = [mainTD, 'grupo_personas_calculada', 'personas', 'personas_calculadas'];
        let insumosTDNames:string[] = this.insumosVars.map(v=>v.tabla_datos);
        if (insumosTDNames.indexOf(mainTD) == -1){ insumosTDNames.push(mainTD) }
        let orderedInsumosTDNames:string[] = orderedTDNames.filter(orderedTDName => insumosTDNames.indexOf(orderedTDName) > -1)
        
        let firstTD = this.opGen.getTD(orderedInsumosTDNames[0]); //tabla mas general (padre)
        let lastTD = this.opGen.getTD(orderedInsumosTDNames[orderedInsumosTDNames.length-1]); //tabla mas específicas (padre)

        //calculo de campos_pk
        // TODO: agregar validación de funciones de agregación, esto es: si la consistencia referencia variables de tablas mas específicas (personas)
        // pero lo hace solo con funciones de agregación, entonces, los campos pk son solo de la tabla mas general, y no de la específica
        this.campos_pk = lastTD.getPKsWitAlias().join(',');

        //calculo de clausula from
        this.clausula_from = 'FROM '+ firstTD.getTableName();
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
        this.clausula_where = `WHERE ${this.getMixConditions()} IS NOT TRUE`;
        
        // execute select final para ver si pasa
        // TODO: agregar try catch de sql
        let selectQuery = `
            SELECT ${await this.getCompleteClausule()}
                  AND ${mainTD}.operativo=$1
                  AND ${mainTD}.id_caso='-1'`;
        await this.client.query(selectQuery,[this.operativo]).execute();
    }

    async getCompleteClausule(): Promise<string> {
        return `${await this.getSelectFields()}
            ${this.clausula_from}
            ${this.clausula_where}`;
    }

    async getSelectFields():Promise<string>{
        return `
            '${this.operativo}',
            '${this.con}',
            jsonb_build_object(${this.getPkIntegrada()}) as pk_integrada,
            jsonb_build_object(${await this.getInConVars()}) as incon_vars`;
    }
    async getInConVars(): Promise<string> {
        var conVars = await ConVar.fetchAll(this.client, this.operativo, this.con);
        return conVars.map(v=>`'${v.tabla_datos}.${v.variable}',${v.tabla_datos.endsWith('calculada')? AppOperativos.prefixTableName(v.tabla_datos,this.operativo): v.tabla_datos}.${v.variable}`).join(',')
    }

    getPkIntegrada():string{
        return this.campos_pk.split(',').map(campoConAlias=> `'${campoConAlias.split('.')[1]}', ${campoConAlias}`).join(',');
    }

    getMixConditions(){
        return '(' + this.precondicion + ') AND (' + this.postcondicion + ')';
    }

    // chequear que todas las variables de la cond existan en alguna tabla (sino se llena el campo error_compilacion)
    validateCondInsumos(): void {
        this.condInsumos = EP.parse(this.getMixConditions()).getInsumos();
        this.validateFunctions(this.condInsumos.funciones);
        this.validateVars(this.condInsumos.variables);
    }

    msgErrorCompilación(){
        return `La consistencia "${this.con}" del operativo "${this.opGen.operativo}" es inválida. `;
    }

    //TODO: ADD PREFIJOS!! (alias)
    validateVars(varNames: string[]): void {
        let operativoGenerator = this.opGen;
        varNames.forEach(varName => {
            let varsFound = operativoGenerator.myVars.filter(v => v.variable == varName);
            if (varsFound.length > 1) {
                throw new Error('La variable "' + varName + '" se encontró mas de una vez en las siguientes tablas de datos: ' + varsFound.map(v => v.tabla_datos).join(', '));
            } else if (varsFound.length <= 0) {
                throw new Error('La variable "' + varName + '" no se encontró en la lista de variables');
            } else {
                let varFound = varsFound[0];
                if (!varFound.activa){throw new Error('La variable "' + varName + '" no está activa.');}
                this.insumosVars.push(varFound);
            }
        });

        // TODO:
        // y si tiene alias ver que esten en relaciones
        // si la variable está prefijada con un alias -> que esté el prefijo
    }

    validateFunctions(funcNames: string[]) {
        let pgWitheList = ['div', 'avg', 'count', 'max', 'min', 'sum', 'coalesce'];
        //TODO sacar el esquema comun, inferirlo
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
            // TODO catch solo errores de pg EP o nuestros, no de mala programación
            this.cleanAll(); //compilation fails then removes all generated data in validateAndPreBuild
            this.error_compilacion = this.msgErrorCompilación() + (<Error>error).message;
            throw new Error(this.error_compilacion);
        } finally {
            await this.updateDB();
        }
    }
        
    private cleanAll() {
        // clean consistencia
        this.valida = false;
        this.compilada = null;
        this.clausula_from = this.clausula_where = this.campos_pk = this.error_compilacion = null;

        // clean con vars to insert
        this.insumosVars=[]; 
    }

    // TODO hacer distintos executes() ya que el procedure de BEPlus asegura que dentro del mismo coreFunction
    // todos los context.client.query.execute() van dentro de la misma transacción (transacción que se abre al iniciar el core function
    // y queda abierta hasta que termina) que rollbaquea todos los execute si algo va mal, además se espera que conectarse varias veces
    // a la DB (hacer distintos executes()) no sea un problema futuro de performance (ya sea porque node y postgres estarán en el 
    // mismo server o bien conectados por fibra). Además como la transacción queda abierta luego del primer execute(), en los consecutivos execute()
    // "se ahorra" bastante overhead de levantar una nueva transacción. Esto es: un motivo mas para no hacer una query choclaso.
    // Entonces haciendo execute diferentes se podrá organizar el código mas modularmente, usar query params y no necesitar poner
    // do begin end.
    async updateDB(): Promise<any> {
        let basicParams = [this.operativo, this.con];
        //delete con_var
        await this.client.query('DELETE FROM con_var WHERE operativo=$1 AND con=$2', basicParams).execute();

        // insert con_vars
        if(this.insumosVars.length > 0){
            let conVarInsertsQuery =  `INSERT INTO con_var (operativo, con, variable, tabla_datos, texto) VALUES 
            ${this.insumosVars.map(ivar=>`($1, $2,'${ivar.variable}','${ivar.tabla_datos}','${ivar.nombre}')`).join(', ')}`;
            await this.client.query(conVarInsertsQuery, basicParams).execute();
        }

        // update consistencias query
        let fieldsToUpdate = ['valida', 'campos_pk', 'clausula_from', 'clausula_where', 'error_compilacion'];
        let esto:any=this; //TODO: ver porque tuvimos que poner tipo any a 'be' para que no falle el map
        // en lugar de ='be[f]' usamos $i+3, el +3 es debido a que operativo=$1 y con=$2
        let conUpdateQuery = `UPDATE consistencias SET 
            compilada=${this.compilada? 'current_timestamp': 'null'},
            ${fieldsToUpdate.map((fieldName, index)=> `${fieldName}=$${index+3}`).join(', ')}
            WHERE operativo=$1 AND con=$2`;
        let params=basicParams.concat(fieldsToUpdate.map(f=> esto[f] ));
        await this.client.query(conUpdateQuery, params).execute();
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
        this.myCons = await Consistencia.fetchAll(client,this.operativo);
    }

}