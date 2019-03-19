import * as EP from "expre-parser";
import { Client, quoteIdent, quoteLiteral, quoteNullable } from 'pg-promise-strict';
import { hasAlias, OperativoGenerator, Variable } from "varcal";
import { ConCompiler } from "./compiler";
import { ConVar } from "./types-consistencias";

export abstract class ConsistenciaDB {
    operativo: string
    consistencia: string
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
    insumosConVars: ConVar[];
    
    condInsumos: EP.Insumos;
    compiler: ConCompiler;
  

    static async fetchOne(client: Client, op: string, con: string): Promise<Consistencia> {
        let result = await client.query(`SELECT * FROM consistencias c WHERE c.operativo = $1 AND c.consistencia = $2`, [op, con]).fetchUniqueRow();
        return Object.assign(new Consistencia(), result.row);
    }

    static async fetchAll(client: Client, op: string): Promise<Consistencia[]> {
        let result = await client.query(`SELECT * FROM consistencias c WHERE c.operativo = $1`, [op]).fetchAll();
        return <Consistencia[]>result.rows.map((con: Consistencia) => Object.setPrototypeOf(con, Consistencia.prototype));
    }

    private async validatePreAndPostCond(): Promise<void> {
        this.validateWellFormed();
        this.validateCondInsumos();
    }

    private validateWellFormed(): any {
        // try to parse with expre-parser to detect bad formed expresion and trow an error
        if (this.precondicion) {
            EP.parse(this.precondicion)
        } else {
            this.precondicion = 'true'
        }
        EP.parse(this.postcondicion)
    }

    //chequear que la expresiones (pre y post) sea correcta (corriendo un select simple para ver si falla postgres) 
    private async buildSQLAndtestInDB() {

        // TODO: agregar validación de funciones de agregación, esto es: si la consistencia referencia variables de tablas mas específicas (personas)
        // pero lo hace solo con funciones de agregación, entonces, los campos pk son solo de la tabla mas general, y no de la específica
        // TODO: separar internas de sus calculadas y que el último TD se tome de las internas 
        this.campos_pk = this.compiler.getLastTDPKsWithAlias();
        this.clausula_from = this.compiler.buildClausulaFrom(this);
        this.clausula_where = this.compiler.buildClausulaWhere(this);

        await this.testBuiltSQL();
    }

    private async testBuiltSQL() {
        // TODO: deshardcodear id_caso de todos lados y operativo también! Pero pidió Emilio que se haga después 
        let selectQuery = this.compiler.getCompleteQuery(this);
        var result = await this.compiler.client.query('select try_sql($1) as error_informado', [selectQuery]).fetchOneRowIfExists();
        if(result.row.error_informado){
            throw new Error(result.row.error_informado);
        }
    }

    getInsumosAliases() {
        let insumosAliases: string[] = this.insumosConVars.map(cv => cv.relacion || cv.tabla_datos);
        insumosAliases = insumosAliases.filter((elem, index, self) => index === self.indexOf(elem)); //remove duplicated
        if (insumosAliases.indexOf(ConCompiler.mainTD) == -1) {
            insumosAliases.push(ConCompiler.mainTD);
        }
        return insumosAliases;
    }

    //TODO: unificar manejo de conVars e insumosVars desde el compilar y desde el consistir
    getCompleteQuery(conVars: ConVar[]): string {
        return `SELECT 
          ${this.getSelectFields(conVars)}
          ${this.clausula_from}
          ${this.clausula_where}`;
    }

    private getSelectFields(conVars: ConVar[]): string {
        return `${quoteLiteral(this.operativo)},
            ${quoteLiteral(this.consistencia)},
            ${this.getPkIntegrada()},
            ${this.getInConVars(conVars)}`;
    }

    private getInConVars(conVars: ConVar[]): string {
        return 'jsonb_build_object(' + conVars.map(conVar => this.getConVarJsonB(conVar)).join(',') + ') as incon_vars';
    }

    private getConVarJsonB(conVar: ConVar) {
        let jsonbPropertyKey = quoteLiteral((conVar.relacion? conVar.relacion: conVar.tabla_datos) + '.' + conVar.variable);
        //TODO: se está usando OperativoGenerator.instanceObj en lugar de this.opGen, mejorar
        let jsonbValueAlias = conVar.relacion? conVar.relacion: OperativoGenerator.instanceObj.getUniqueTD(conVar.tabla_datos).getTableName();
        return `${jsonbPropertyKey},${quoteIdent(jsonbValueAlias)}.${quoteIdent(conVar.variable)}`;
    }

    private getPkIntegrada(): string {
        return `jsonb_build_object(
          ${this.campos_pk.split(',').map(campoConAlias => Consistencia.pkIntegradaElement(campoConAlias)).join(',')}
        ) as pk_integrada`;
    }

    private static pkIntegradaElement(campoConAlias: string) {
        let [alias, field] = campoConAlias.split('.');
        return `${quoteLiteral(field)}, ${quoteIdent(alias)}.${quoteIdent(field)}`
    }

    getMixConditions():string {
        return '(' + this.precondicion + ') AND (' + this.postcondicion + ')';
    }

    // chequear que todas las variables de la cond existan en alguna tabla (sino se llena el campo error_compilacion)
    private validateCondInsumos(): void {
        this.condInsumos = EP.parse(this.getMixConditions()).getInsumos();
        this.validateFunctions(this.condInsumos.funciones);
        this.validateVars(this.condInsumos.variables);
    }

    private msgErrorCompilación() {
        return ` La consistencia "${this.consistencia}" del operativo "${this.operativo}" es inválida.`;
    }

    private validateVars(varNames: string[]): void {

        varNames.forEach(varName => {
            let conVar = new ConVar(); // supongo que voy a encontrar una sola variable y válida
            let varsFound: Variable[] = this.findValidVars(varName, conVar);
            
            if (varsFound.length > 1) {
                throw new Error('La variable "' + varName + '" se encontró mas de una vez en las siguientes tablas de datos: ' + varsFound.map(v => v.tabla_datos).join(', '));
            }
            if (varsFound.length <= 0) {
                throw new Error('La variable "' + varName + '" no se encontró en la lista de variables.');
            }

            let varFound = varsFound[0];
            if (!varFound.activa) { throw new Error('La variable "' + varName + '" no está activa.'); }

            //lleno el resto de la variable a con_var
            Object.assign(conVar, <ConVar>{operativo: varFound.operativo, tabla_datos: varFound.tabla_datos, variable:varFound.variable, texto:varFound.nombre });
            this.insumosConVars.push(conVar);
        });
    }

    private findValidVars(varName: string, conVar: ConVar) {
        let rawVarName = varName;
        let varsFound:Variable[] = this.compiler.validVars;
        if (hasAlias(varName)) {
            let varAlias = varName.split('.')[0];
            rawVarName = varName.split('.')[1];

            let validRelationsNames = this.compiler.optionalRelations.map(rel=>rel.que_busco)

            let validAliases = ConCompiler.validTDNames().concat(validRelationsNames);
            if (validAliases.indexOf(varAlias) == -1) {
                throw new Error('El alias "' + varAlias + '" no se encontró en la lista de alias válidos: ' + validAliases.join(', '));
            }
            let tdName = varAlias;
            if (validRelationsNames.indexOf(varAlias) > -1) {
                conVar.relacion = varAlias;
                tdName = this.compiler.optionalRelations.find(rel => rel.que_busco == varAlias).tabla_busqueda;
            }
            varsFound = varsFound.filter(v => v.tabla_datos == tdName);
        }
        return varsFound.filter(v => v.variable == rawVarName);
    }

    private validateFunctions(funcNames: string[]) {
        let pgWitheList = ['div', 'avg', 'count', 'max', 'min', 'sum', 'coalesce'];
        let comunSquemaWhiteList = ['informado'];
        let functionWhiteList = pgWitheList.concat(comunSquemaWhiteList);
        funcNames.forEach(f => {
            if (hasAlias(f)) {
                if (f.split('.')[0] != 'dbo') {
                    throw new Error('La Función ' + f + ' contiene un alias inválido');
                }
            } else {
                if (functionWhiteList.indexOf(f) == -1) {
                    throw new Error('La Función ' + f + ' no está incluida en la whiteList de funciones: ' + functionWhiteList.toString());
                }
            }
        })
    }

    /**
     * El proceso de compilar una consistencia consiste en:
     * 1) valida la expresión de la consistencia 
     *  a. Chequea que la expresión sea un SQL válido
     *  b. Chequea insumos (variables y funciones) válidos y correctos 
     * 2) Construye el SQL (que se usará para correr la consistencia)
     * 3) Chequea el SQL generado ejecutandolo con un select
     * 4) Si todo salió bien guarda los SQL generados y marca consistencia como válida, sino
     *  tira error informando el motivo
     * 
     * Los SQL generados de una consistencia serán usados luego para correr la consistencia
     */
    async compilar(compiler: ConCompiler) {
        this.compiler = compiler;
        
        try {
            this.cleanAll();
            await this.validatePreAndPostCond();
            await this.buildSQLAndtestInDB();
            this.markAsValid();
        } catch (error) {
            // TODO catch solo errores de pg EP o nuestros, no de mala programación
            this.cleanAll(); //compilation fails then removes all generated data in validateAndPreBuild
            this.error_compilacion = (<Error>error).message;
            throw new Error(this.error_compilacion + this.msgErrorCompilación());
        }
        finally {
            await this.updateDB();
        }
    }

    markAsValid(): void {
        // pass all validations then complete this consistence to save afterwards
        this.compilada = new Date();
        this.valida = true;
    }

    private cleanAll() {
        // clean consistencia
        this.valida = false;
        this.compilada = null;
        this.clausula_from = this.clausula_where = this.campos_pk = this.error_compilacion = null;

        // clean con vars to insert
        this.insumosConVars = [];
    }

    // Se hacen distintos executes() ya que el procedure de BEPlus asegura que dentro del mismo coreFunction
    // todos los context.client.query.execute() van dentro de la misma transacción (transacción que se abre al iniciar el core function
    // y queda abierta hasta que termina) que rollbaquea todos los execute si algo va mal, además se espera que conectarse varias veces
    // a la DB (hacer distintos executes()) no sea un problema futuro de performance (ya sea porque node y postgres estarán en el 
    // mismo server o bien conectados por fibra). Además como la transacción queda abierta luego del primer execute(), en los consecutivos execute()
    // "se ahorra" bastante overhead de levantar una nueva transacción. Esto es: un motivo mas para no hacer una query choclaso.
    // Entonces haciendo execute diferentes se podrá organizar el código mas modularmente, usar query params y no necesitar poner
    // do begin end.
    private async updateDB(): Promise<any> {
        let basicParams = [this.operativo, this.consistencia];
        let client = this.compiler.client
        //delete con_var
        await client.query('DELETE FROM con_var WHERE operativo=$1 AND consistencia=$2', basicParams).execute();

        // insert con_vars
        if (this.insumosConVars.length > 0) {
            let conVarInsertsQuery = `INSERT INTO con_var (operativo, consistencia, expresion_var, tabla_datos, variable, relacion, texto) VALUES 
            ${this.insumosConVars.map(cv => `($1, $2,${quoteLiteral(cv.buildExpresionVar())},${quoteLiteral(cv.tabla_datos)},${quoteLiteral(cv.variable)},${quoteNullable(cv.relacion)},${quoteNullable(cv.texto)})`).join(', ')}`;
            await client.query(conVarInsertsQuery, basicParams).execute();
        }

        // update consistencias query
        let fieldsToUpdate = ['valida', 'campos_pk', 'clausula_from', 'clausula_where', 'error_compilacion'];
        let esto: any = this; //TODO: ver porque tuvimos que poner tipo any a 'be' para que no falle el map
        // en lugar de ='be[f]' usamos $i+3, el +3 es debido a que operativo=$1 y consistencia=$2
        let conUpdateQuery = `UPDATE consistencias SET 
            compilada=${this.compilada ? 'current_timestamp' : 'null'},
            ${fieldsToUpdate.map((fieldName, index) => `${quoteIdent(fieldName)}=$${index + 3}`).join(', ')}
            WHERE operativo=$1 AND consistencia=$2`;
        let params = basicParams.concat(fieldsToUpdate.map(f => esto[f]));
        await client.query(conUpdateQuery, params).execute();
    }

    correr() {
        if (!this.valida) {
            throw new Error('La consistencia ' + this.consistencia + ' debe haber compilado exitosamente');
        }
    }
}