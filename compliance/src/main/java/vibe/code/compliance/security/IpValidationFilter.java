package vibe.code.compliance.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Arrays;
import java.util.List;

@Slf4j

@Component
public class IpValidationFilter extends OncePerRequestFilter {

    private final List<String> trustedIps;

    public IpValidationFilter(@Value("${security.trusted-ips:127.0.0.1}") String trustedIpsConfig) {
        this.trustedIps = Arrays.asList(trustedIpsConfig.split(","));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        if (request.getRequestURI().startsWith("/api/admin")) {
            String clientIp = resolveClientIp(request);
            log.info("IP validation check for /api/admin: clientIp={}, trustedIps={}", clientIp, trustedIps);
            if (!isTrusted(clientIp)) {
                log.warn("IP REJECTED: {} not in trusted list: {}", clientIp, trustedIps);
                response.setStatus(HttpStatus.FORBIDDEN.value());
                response.setContentType("application/json");
                response.getWriter().write(
                        "{\"message\":\"Access denied: untrusted IP\",\"ip\":\"" + clientIp + "\"}"
                );
                return;
            }
            log.info("IP ACCEPTED: {}", clientIp);
        }
        filterChain.doFilter(request, response);
    }

    private String resolveClientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    private boolean isTrusted(String ip) {
        boolean trusted = trustedIps.stream().anyMatch(t -> {
            String trimmed = t.trim();
            if (trimmed.contains("/")) {
                return isInCidr(ip, trimmed);
            }
            return trimmed.equals(ip) || trimmed.equalsIgnoreCase(ip);
        });

        if (!trusted) {
            log.warn("IP validation failed for: {} (trusted IPs: {})", ip, trustedIps);
        } else {
            log.debug("IP validation passed for: {}", ip);
        }

        return trusted;
    }

    private boolean isInCidr(String ip, String cidr) {
        try {
            String[] parts = cidr.split("/");
            int prefixLen = Integer.parseInt(parts[1]);
            long networkAddr = ipToLong(parts[0]);
            long clientAddr = ipToLong(ip);
            long mask = prefixLen == 0 ? 0L : (-1L << (32 - prefixLen)) & 0xFFFFFFFFL;
            return (networkAddr & mask) == (clientAddr & mask);
        } catch (Exception e) {
            return false;
        }
    }

    private long ipToLong(String ip) {
        String[] parts = ip.split("\\.");
        long result = 0;
        for (String part : parts) {
            result = result * 256 + Long.parseLong(part.trim());
        }
        return result;
    }
}
