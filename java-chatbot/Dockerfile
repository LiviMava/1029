FROM maven:3.9.9-eclipse-temurin-17 AS build
WORKDIR /build
COPY pom.xml ./pom.xml
COPY src ./src
# Optional mirror for faster dependency downloads; empty keeps Maven Central.
ARG MAVEN_MIRROR_URL=
RUN --mount=type=cache,target=/root/.m2 \
    if [ -n "$MAVEN_MIRROR_URL" ]; then \
      mkdir -p /root/.m2 && \
      printf '<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0"><mirrors><mirror><id>build-mirror</id><mirrorOf>central</mirrorOf><url>%s</url></mirror></mirrors></settings>\n' "$MAVEN_MIRROR_URL" > /root/.m2/settings.xml; \
    fi && \
    mvn -B -ntp package

FROM eclipse-temurin:17-jre-jammy AS runtime
RUN groupadd --system --gid 10001 rag \
    && useradd --system --uid 10001 --gid rag --home-dir /app --shell /usr/sbin/nologin rag \
    && mkdir -p /app/data \
    && chown -R rag:rag /app
WORKDIR /app
COPY --from=build --chown=rag:rag /build/target/java-chatbot-1.0.0.jar /app/app.jar
USER 10001:10001
ENV SERVER_PORT=8090 \
    RAG_DATA_DIR=/app/data
EXPOSE 8090
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
