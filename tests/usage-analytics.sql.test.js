// Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite (test only).
// Uses PostgreSQL locally, never the production Supabase project.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
let checks=0;
const id='00000000-0000-4000-8000-000000000001';
(async()=>{
 const db=new PGlite();
 try{
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; GRANT USAGE ON SCHEMA public TO anon, authenticated;');
  // Simulate broad Supabase default grants: migration must remove them.
  await db.exec('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;');
  await db.exec(fs.readFileSync(path.join(__dirname,'../docs/sql/usage-analytics-create.sql'),'utf8'));
  const reject=async(sql,code)=>{await assert.rejects(db.exec(sql),e=>e.code===code);checks++;};
  await db.exec('SET ROLE anon');
  await db.exec(`INSERT INTO usage_browser_days(browser_id) VALUES ('${id}')`);checks++;
  await reject(`INSERT INTO usage_browser_days(browser_id) VALUES ('${id}')`,'23505');
  await reject("INSERT INTO usage_browser_days(browser_id) VALUES ('garbage')",'22P02');
  await reject(`INSERT INTO usage_browser_days(browser_id,used_on) VALUES ('${id}','2000-01-01')`,'42501');
  await reject(`INSERT INTO usage_browser_days(browser_id) VALUES ('00000000-0000-4000-8000-000000000002') RETURNING *`,'42501');
  for(const role of ['anon','authenticated']){
   await db.exec('RESET ROLE; SET ROLE '+role);
   for(const sql of ['SELECT * FROM usage_browser_days','UPDATE usage_browser_days SET used_on=CURRENT_DATE','DELETE FROM usage_browser_days'])await reject(sql,'42501');
  }
  await reject(`INSERT INTO usage_browser_days(browser_id) VALUES ('${id}')`,'42501');
  await db.exec('RESET ROLE');
  assert.equal((await db.query("SELECT used_on=(now() AT TIME ZONE 'Asia/Tokyo')::date AS correct FROM usage_browser_days")).rows[0].correct,true);checks++;
  await db.exec(`INSERT INTO usage_browser_days VALUES ('${id}',(now() AT TIME ZONE 'Asia/Tokyo')::date-29),('00000000-0000-4000-8000-000000000002',(now() AT TIME ZONE 'Asia/Tokyo')::date-30)`);
  const countSQL=fs.readFileSync(path.join(__dirname,'../docs/sql/usage-analytics-count.sql'),'utf8');
  assert.equal(Number((await db.query(countSQL)).rows[0].active_browsers),1);checks++;
  await db.exec("DELETE FROM usage_browser_days WHERE used_on < (now() AT TIME ZONE 'Asia/Tokyo')::date-29");
  assert.equal((await db.query('SELECT count(*)::int AS n FROM usage_browser_days')).rows[0].n,2);checks++;
  console.log(`ALL PASS — ${checks} PostgreSQL permission/count checks; production DB writes: 0`);
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
