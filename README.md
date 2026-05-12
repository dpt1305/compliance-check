$env:MAVEN_OPTS="-Dmaven.wagon.http.ssl.insecure=true -Dmaven.wagon.http.ssl.allowall=true -Djavax.net.ssl.trustStoreType=WINDOWS-ROOT"
mvn clean install -U
