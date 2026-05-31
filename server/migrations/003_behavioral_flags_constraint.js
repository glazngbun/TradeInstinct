import 'dotenv/config'
import pool from '../db.js'

async function migrate(){
    const client = await pool.connect()
    try{
        await client.query('BEGIN');

        await client.query(`
            ALTER TABLE behavioral_flags
            ADD CONSTRAINT unique_trade_flag
            UNIQUE(trade_id, flag_type)
            `)
    

        console.log("unique contraint added")

        await client.query(`COMMIT`);
        }catch(err){
            client.query(`ROLLBACK`);
            console.error('Migration failed', err.message)
            process.exit(1)
        }
        finally{
            client.release;
            await pool.end();
                }

}

migrate();