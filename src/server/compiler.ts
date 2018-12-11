import { OperativoGenerator } from "varcal";

export class Compiler extends OperativoGenerator{

    consistirCaso(idCaso:string){

                    // se corre VARCAL
                    await this.client.query(`SELECT varcal_provisorio_por_encuesta($1, $2)`, params).execute();
                    var consistencias = await Consistencia.fetchAll(context.client, parameters.operativo);
        

    }
}