package com.demo.upimesh.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Only matters if something calls this API directly from a browser on a
 * different origin than the frontend's own domain — e.g. testing the
 * deployed backend with the dashboard open from a different host, or a
 * frontend deployment that isn't proxying /api through its own domain
 * (a Vercel rewrite, for instance, makes requests same-origin from the
 * browser's point of view and never needs this at all).
 *
 * Origins come from a property so this can stay locked down in one
 * deployment and wide open in another without a code change.
 */
@Configuration
public class CorsConfig implements WebMvcConfigurer {

    @Value("${upi.mesh.cors-allowed-origins:*}")
    private String[] allowedOrigins;

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(allowedOrigins)
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*");
    }
}
