# Multi-stage build: compile with a full JDK image, run on a slim JRE so the
# shipped image doesn't carry the whole Maven toolchain.

FROM eclipse-temurin:17-jdk-jammy AS build
WORKDIR /app

# Cache dependencies separately from source so a source-only change doesn't
# re-download the whole dependency tree.
COPY mvnw .
COPY .mvn .mvn
COPY pom.xml .
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
ENTRYPOINT ["sh", "-c", "java -jar app.jar --server.port=${PORT}"]
