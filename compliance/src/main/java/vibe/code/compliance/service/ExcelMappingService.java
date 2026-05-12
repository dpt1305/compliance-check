package vibe.code.compliance.service;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.util.*;

@Service
@Slf4j
public class ExcelMappingService {

    private final ResourceLoader resourceLoader;

    @Value("${excel.mapping.path:classpath:mapping/type-mapping.xlsx}")
    private String mappingFilePath;

    // submissionType -> TypeMapping
    private final Map<String, TypeMapping> typeCache = new HashMap<>();

    public ExcelMappingService(ResourceLoader resourceLoader) {
        this.resourceLoader = resourceLoader;
    }

    @PostConstruct
    public void loadMappings() {
        try {
            Resource resource = resourceLoader.getResource(mappingFilePath);
            if (!resource.exists()) {
                log.warn("Excel mapping file not found at '{}'. Using default mappings.", mappingFilePath);
                loadDefaultMappings();
                return;
            }
            try (InputStream is = resource.getInputStream();
                 Workbook workbook = new XSSFWorkbook(is)) {

                Sheet sheet = workbook.getSheetAt(0);
                int loaded = 0;

                for (Row row : sheet) {
                    if (row.getRowNum() == 0) continue; // skip header
                    String submissionType = getCellValue(row, 0);
                    String allowedTypes   = getCellValue(row, 1);
                    String description    = getCellValue(row, 2);
                    String keywords       = getCellValue(row, 3);
                    String validationRules = getCellValue(row, 4);

                    if (submissionType == null || submissionType.isBlank()) continue;

                    typeCache.put(submissionType.toLowerCase().trim(),
                            new TypeMapping(submissionType, allowedTypes, description, keywords, validationRules));
                    loaded++;
                }
                log.info("Loaded {} submission type mappings from Excel", loaded);
            }
        } catch (Exception e) {
            log.error("Failed to load Excel mapping file: {}. Using defaults.", e.getMessage());
            loadDefaultMappings();
        }
    }

    private void loadDefaultMappings() {
        String windowsRules = "clock:bottom-right,windows-update:yes,device-name:full,device-serial:full,dashboard:security";
        String macRules = "mac-info:visible,seed-dashboard:yes|trellix:ok,timestamp:top-right";
        String thinRules = "timestamp:visible,windows-update:yes|security-status:ok";

        typeCache.put("windows", new TypeMapping("windows", "jpg,jpeg,png,webp", "Windows laptop or desktop",   "windows,laptop,dell,hp,lenovo,thinkpad", windowsRules));
        typeCache.put("mac",     new TypeMapping("mac",     "jpg,jpeg,png,webp", "Apple Mac device",            "mac,macbook,macbook pro,macbook air,imac", macRules));
        typeCache.put("thin",    new TypeMapping("thin",    "jpg,jpeg,png,webp", "Thin client device",          "thin client,wyse,igel,hp thin", thinRules));
        log.info("Loaded default type mappings");
    }

    public Optional<TypeMapping> getMapping(String submissionType) {
        if (submissionType == null) return Optional.empty();
        return Optional.ofNullable(typeCache.get(submissionType.toLowerCase().trim()));
    }

    public Set<String> getSupportedTypes() {
        return Collections.unmodifiableSet(typeCache.keySet());
    }

    public boolean isTypeSupported(String submissionType) {
        return submissionType != null && typeCache.containsKey(submissionType.toLowerCase().trim());
    }

    private String getCellValue(Row row, int col) {
        Cell cell = row.getCell(col, Row.MissingCellPolicy.RETURN_BLANK_AS_NULL);
        if (cell == null) return null;
        return switch (cell.getCellType()) {
            case STRING  -> cell.getStringCellValue().trim();
            case NUMERIC -> String.valueOf((long) cell.getNumericCellValue());
            default      -> null;
        };
    }

    public record TypeMapping(
            String submissionType,
            String allowedImageTypes,
            String description,
            String exampleKeywords,
            String validationRules
    ) {
        public List<String> allowedTypeList() {
            return Arrays.stream(allowedImageTypes.split(","))
                    .map(String::trim)
                    .toList();
        }
    }
}
