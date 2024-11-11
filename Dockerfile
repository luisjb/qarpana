FROM postgres:13

COPY init-db.sh /docker-entrypoint-initdb.d/
COPY dataBase.tar /docker-entrypoint-initdb.d/

RUN chmod +x /docker-entrypoint-initdb.d/init-db.sh