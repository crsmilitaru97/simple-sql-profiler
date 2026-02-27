use serde::Deserialize;
use tiberius::{AuthMethod, Client, Config, EncryptionLevel};
use tokio::net::TcpStream;
use tokio_util::compat::{Compat, TokioAsyncWriteCompatExt};

#[derive(Debug, Clone, Deserialize)]
pub struct ConnectionConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub database: String,
    pub trust_cert: bool,
}

pub type SqlClient = Client<Compat<TcpStream>>;

pub async fn connect(config: &ConnectionConfig) -> Result<SqlClient, String> {
    let mut tib_config = Config::new();
    tib_config.host(&config.host);
    tib_config.port(config.port);
    tib_config.database(&config.database);
    tib_config.authentication(AuthMethod::sql_server(&config.username, &config.password));

    if config.trust_cert {
        tib_config.trust_cert();
    }

    tib_config.encryption(EncryptionLevel::Required);

    let tcp = TcpStream::connect(tib_config.get_addr())
        .await
        .map_err(|e| format!("TCP connection failed: {e}"))?;

    tcp.set_nodelay(true)
        .map_err(|e| format!("Failed to set TCP_NODELAY: {e}"))?;

    let client = Client::connect(tib_config, tcp.compat_write())
        .await
        .map_err(|e| format!("SQL Server connection failed: {e}"))?;

    Ok(client)
}
