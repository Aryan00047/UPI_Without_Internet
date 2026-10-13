# Multi-stage build: compile with a full JDK image, run on a slim JRE so the
# shipped image doesn't carry the whole Maven toolchain.

FROM eclipse-temurin:17-jdk-jammy AS build
WORKDIR /app

# Cache dependencies separately from source so a source-only change doesn't
# re-download the whole dependency tree.
COPY mvnw .
COPY .mvn .mvn
COPY pom.xml .
# The git-tracked file mode on mvnw isn't reliably +x after a Windows
# checkout/commit, so set it explicitly rather than depending on it.
RUN chmod +x mvnw
RUN ./mvnw -B dependency:go-offline

COPY src src
RUN ./mvnw -B clean package -DskipTests

FROM eclipse-temurin:17-jre-jammy
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar

# Render/Railway/Fly all inject PORT at runtime; Spring Boot reads it
# straight from the environment via this property placeholder.
ENV PORT=8080
EXPOSE 8080
# java.security.egd=file:/dev/./urandom: on a freshly-started, CPU-limited
# container, the JVM's default SecureRandom can block waiting for OS
# entropy — this app calls it heavily on boot (the server's RSA keypair
# plus one more per demo account), which was stalling startup past
# Render's port-scan timeout. urandom is non-blocking and fine for this
# use (key generation at boot, not a long-lived secret-rotation service).
ENTRYPOINT ["sh", "-c", "java -Djava.security.egd=file:/dev/./urandom -jar app.jar --server.port=${PORT}"]
