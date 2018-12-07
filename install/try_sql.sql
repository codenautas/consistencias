CREATE OR REPLACE FUNCTION try_sql(p_sql text) returns text
  language plpgsql
as
$body$
begin
  execute p_sql;
  return null;
exception
  when others then
    return SQLSTATE||' - '||SQLERRM;
end;
$body$;
