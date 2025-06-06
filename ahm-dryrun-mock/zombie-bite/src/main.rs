use std::fs;
use rand::Rng;
use std::thread;
use std::time::Duration;

fn main() {
    println!("🧟Zombie-bite starting");
    
    thread::sleep(Duration::from_secs(10));
    // Generate random ports
    let mut rng = rand::thread_rng();
    let alice_port = rng.gen_range(9000..10000);
    let collator_port = rng.gen_range(10001..11000);

    // Write ports to .env
    let ports_env = format!(
        "ALICE_PORT={}\nCOLLATOR_PORT={}",
        alice_port, collator_port
    );
    fs::write(".env", ports_env).expect("Failed to write ports");
    println!("🧟Ports written: alice_port={}, collator_port={}", alice_port, collator_port);

    // Delay before writing blocks - 10 seconds
    thread::sleep(Duration::from_secs(10));

    // Generate random blocks
    let ah_start_block = rng.gen_range(1000..2000);
    let rc_start_block = rng.gen_range(2001..3000);
    let ah_finish_block = rng.gen_range(3001..4000);
    let rc_finish_block = rng.gen_range(4001..5000);

    // Write blocks to .env
    let blocks_env = format!(
        "ALICE_PORT={}\nCOLLATOR_PORT={}\n\
        AH_START_BLOCK={}\nRC_START_BLOCK={}\n\
        AH_FINISH_BLOCK={}\nRC_FINISH_BLOCK={}",
        alice_port, collator_port,
        ah_start_block, rc_start_block,
        ah_finish_block, rc_finish_block
    );
    fs::write(".env", blocks_env).expect("Failed to write blocks");
    println!("🧟Blocks written: ah_start={}, rc_start={}, ah_finish={}, rc_finish={}", 
        ah_start_block, rc_start_block, ah_finish_block, rc_finish_block);

    println!("🧟Zombie-bite running");
    loop {
        thread::sleep(Duration::from_secs(3600));
    }
}