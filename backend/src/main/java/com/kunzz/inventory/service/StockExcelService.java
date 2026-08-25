package com.kunzz.inventory.service;

import com.kunzz.inventory.mapper.StockExcelMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 进出货 Excel 导出（对齐线上 export_branch_stock_excel.php）
 * 输出 HTML 表格格式 .xls（Excel 兼容）
 */
@Service
@RequiredArgsConstructor
public class StockExcelService {

    private final StockExcelMapper stockExcelMapper;

    /** 表名：中央 stockinout_data，分店 jXstockedit_data */
    private String tableOf(String system) {
        return "central".equalsIgnoreCase(system) ? "stockinout_data" : system.toLowerCase() + "stockedit_data";
    }

    /** 中央排除 SOT（对齐旧系统 stockeditapi export） */
    private boolean excludeSot(String system) {
        return "central".equalsIgnoreCase(system);
    }

    public String buildHtml(String system, String startDate, String endDate, boolean includeIn, boolean includeOut) {
        List<Map<String, Object>> rows = listRange(system, startDate, endDate, includeIn, includeOut);

        StringBuilder sb = new StringBuilder();
        sb.append("<html><head><meta charset=\"UTF-8\"></head><body>")
          .append("<table border=\"1\">")
          .append("<tr><th>日期</th><th>时间</th><th>货品编号</th><th>货品名称</th><th>入库</th><th>出库</th><th>目标系统</th><th>规格</th><th>单价</th><th>总价</th><th>收货人</th><th>备注</th></tr>");
        for (Map<String, Object> r : rows) {
            sb.append("<tr>")
              .append(td(r.get("date"))).append(td(r.get("time")))
              .append(td(r.get("code_number"))).append(td(r.get("product_name")))
              .append(td(r.get("in_quantity"))).append(td(r.get("out_quantity")))
              .append(td(r.get("target_system"))).append(td(r.get("specification")))
              .append(td(r.get("price"))).append(td(r.get("total")))
              .append(td(r.get("receiver"))).append(td(r.get("remark")))
              .append("</tr>");
        }
        sb.append("</table></body></html>");
        return sb.toString();
    }

    /** 进出货 PDF 导出（OpenPDF，STSong-Light 支持中文） */
    public byte[] buildPdf(String system, String startDate, String endDate, boolean includeIn, boolean includeOut) throws java.io.IOException {
        com.lowagie.text.Document doc = new com.lowagie.text.Document(com.lowagie.text.PageSize.A4.rotate(), 24, 24, 24, 24);
        java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
        com.lowagie.text.pdf.PdfWriter.getInstance(doc, bos);
        doc.open();
        try {
            com.lowagie.text.pdf.BaseFont bf = com.lowagie.text.pdf.BaseFont.createFont("STSong-Light", "UniGB-UCS2-H", com.lowagie.text.pdf.BaseFont.NOT_EMBEDDED);
            com.lowagie.text.Font titleFont = new com.lowagie.text.Font(bf, 14, com.lowagie.text.Font.BOLD);
            com.lowagie.text.Font headFont = new com.lowagie.text.Font(bf, 9, com.lowagie.text.Font.BOLD);
            com.lowagie.text.Font cellFont = new com.lowagie.text.Font(bf, 8, com.lowagie.text.Font.NORMAL);

            com.lowagie.text.Paragraph title = new com.lowagie.text.Paragraph("进出货 - " + system.toUpperCase()
                    + (startDate == null || endDate == null ? "" : "  (" + startDate + " ~ " + endDate + ")"), titleFont);
            title.setAlignment(com.lowagie.text.Element.ALIGN_CENTER);
            doc.add(title);
            doc.add(new com.lowagie.text.Paragraph(" "));

            com.lowagie.text.pdf.PdfPTable table = new com.lowagie.text.pdf.PdfPTable(12);
            table.setWidthPercentage(100);
            table.setWidths(new float[]{4.5f, 3.2f, 4.5f, 8f, 3.2f, 3.2f, 3.4f, 3.8f, 3.2f, 3.8f, 5f, 8f});
            String[] headers = {"日期", "时间", "货品编号", "货品名称", "入库", "出库", "目标系统", "规格", "单价", "总价", "收货人", "备注"};
            for (String h : headers) {
                com.lowagie.text.pdf.PdfPCell c = new com.lowagie.text.pdf.PdfPCell(new com.lowagie.text.Phrase(h, headFont));
                c.setGrayFill(0.8f);
                c.setHorizontalAlignment(com.lowagie.text.Element.ALIGN_CENTER);
                c.setPadding(4);
                table.addCell(c);
            }
            List<Map<String, Object>> rows = buildData(system, startDate, endDate, includeIn, includeOut);
            int i = 0;
            for (Map<String, Object> r : rows) {
                i++;
                String[] vals = {
                        str(r.get("date")), str(r.get("time")), str(r.get("code_number")), str(r.get("product_name")),
                        str(r.get("in_quantity")), str(r.get("out_quantity")), str(r.get("target_system")),
                        str(r.get("specification")), str(r.get("price")), str(r.get("total")),
                        str(r.get("receiver")), str(r.get("remark"))};
                for (int c = 0; c < vals.length; c++) {
                    com.lowagie.text.pdf.PdfPCell cell = new com.lowagie.text.pdf.PdfPCell(new com.lowagie.text.Phrase(vals[c], cellFont));
                    if (i % 2 == 0) cell.setGrayFill(0.95f);
                    cell.setPadding(3);
                    table.addCell(cell);
                }
            }
            doc.add(table);
        } finally {
            doc.close();
        }
        return bos.toByteArray();
    }

    /** 结构化数据（前端 jsPDF 生成 PDF 用），字段与 buildHtml 表头一致 */
    public List<Map<String, Object>> buildData(String system, String startDate, String endDate, boolean includeIn, boolean includeOut) {
        return listRange(system, startDate, endDate, includeIn, includeOut);
    }

    /** 中央出库数据（invoice PDF 用） */
    public List<Map<String, Object>> invoiceData(String system, String startDate, String endDate) {
        List<Map<String, Object>> rows = stockExcelMapper.listInvoiceData(system.toLowerCase(), startDate, endDate);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("date", str(r.get("date")));
            m.put("code_number", str(r.get("code_number")));
            m.put("product_name", str(r.get("product_name")));
            m.put("out_quantity", str(r.get("out_quantity")));
            m.put("specification", str(r.get("specification")));
            m.put("price", str(r.get("price")));
            out.add(m);
        }
        return out;
    }

    /** 分店 Excel 导出（对齐旧系统 export_branch_stock_excel.php：只含入库，8 列） */
    public String buildBranchExcel(String system, String startDate, String endDate) {
        String table = system.toLowerCase() + "stockinout_data";
        List<Map<String, Object>> rows = stockExcelMapper.listBranchInbound(table, startDate, endDate);
        StringBuilder sb = new StringBuilder();
        sb.append("<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:x='urn:schemas-microsoft-com:office:excel' xmlns='http://www.w3.org/TR/REC-html40'>")
          .append("<head><meta charset='utf-8'><style>")
          .append("table { border-collapse: collapse; width: 100%; }")
          .append("th, td { border: 1px solid #000; padding: 6px; text-align: center; font-family: Arial, sans-serif; font-size: 12px; }")
          .append("th { background-color: #99d9ea; font-weight: bold; }")
          .append("td.text-left { text-align: left; }")
          .append("td.currency { mso-number-format:'\\0022RM\\0022\\ #,##0.00'; }")
          .append("td.decimal { mso-number-format:'0.000'; }")
          .append("td.integer { mso-number-format:'0'; }")
          .append("</style></head><body><table>")
          .append("<tr><th>NO:</th><th>Date</th><th>Code</th><th>Product</th><th>In Quantity</th><th>Specification</th><th>Price</th><th>Total Price</th></tr>");
        int counter = 1;
        for (Map<String, Object> r : rows) {
            double inQ = toD(str(r.get("in_quantity")));
            double p = toD(str(r.get("price")));
            double total = inQ * p;
            sb.append("<tr>")
              .append("<td class='integer'>").append(counter).append("</td>")
              .append("<td>").append(html(str(r.get("date")))).append("</td>")
              .append("<td class='text-left'>").append(html(str(r.get("code_number")))).append("</td>")
              .append("<td class='text-left'>").append(html(str(r.get("product_name")))).append("</td>")
              .append("<td class='decimal'>").append(fmt3(inQ)).append("</td>")
              .append("<td class='text-left'>").append(html(str(r.get("specification")))).append("</td>")
              .append("<td class='currency'>").append(fmt2(p)).append("</td>")
              .append("<td class='currency'>").append(fmt2(total)).append("</td>")
              .append("</tr>");
            counter++;
        }
        if (counter == 1) {
            sb.append("<tr><td colspan='8'>No inbound records found for the selected range.</td></tr>");
        }
        sb.append("</table></body></html>");
        return sb.toString();
    }

    /** 分店 PDF 导出（对齐旧系统 export_branch_stock_excel.php 内容：jXstockinout_data 入库，8 列；OpenPDF 中文） */
    public byte[] buildBranchPdf(String system, String startDate, String endDate) throws java.io.IOException {
        String table = system.toLowerCase() + "stockinout_data";
        List<Map<String, Object>> rows = stockExcelMapper.listBranchInbound(table, startDate, endDate);
        com.lowagie.text.Document doc = new com.lowagie.text.Document(com.lowagie.text.PageSize.A4.rotate(), 24, 24, 24, 24);
        java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
        com.lowagie.text.pdf.PdfWriter.getInstance(doc, bos);
        doc.open();
        try {
            com.lowagie.text.pdf.BaseFont bf = com.lowagie.text.pdf.BaseFont.createFont("STSong-Light", "UniGB-UCS2-H", com.lowagie.text.pdf.BaseFont.NOT_EMBEDDED);
            com.lowagie.text.Font titleFont = new com.lowagie.text.Font(bf, 14, com.lowagie.text.Font.BOLD);
            com.lowagie.text.Font headFont = new com.lowagie.text.Font(bf, 9, com.lowagie.text.Font.BOLD);
            com.lowagie.text.Font cellFont = new com.lowagie.text.Font(bf, 8, com.lowagie.text.Font.NORMAL);

            com.lowagie.text.Paragraph title = new com.lowagie.text.Paragraph(system.toUpperCase() + " Stock ("
                    + (startDate == null ? "" : startDate) + " ~ " + (endDate == null ? "" : endDate) + ")", titleFont);
            title.setAlignment(com.lowagie.text.Element.ALIGN_CENTER);
            doc.add(title);
            doc.add(new com.lowagie.text.Paragraph(" "));

            com.lowagie.text.pdf.PdfPTable ptable = new com.lowagie.text.pdf.PdfPTable(8);
            ptable.setWidthPercentage(100);
            ptable.setWidths(new float[]{3, 6, 8, 18, 8, 8, 7, 8});
            String[] headers = {"NO:", "Date", "Code", "Product", "In Quantity", "Specification", "Price", "Total Price"};
            for (String h : headers) {
                com.lowagie.text.pdf.PdfPCell c = new com.lowagie.text.pdf.PdfPCell(new com.lowagie.text.Phrase(h, headFont));
                c.setGrayFill(0.85f);
                c.setHorizontalAlignment(com.lowagie.text.Element.ALIGN_CENTER);
                c.setPadding(4);
                ptable.addCell(c);
            }
            int i = 0;
            for (Map<String, Object> r : rows) {
                i++;
                double inQ = toD(str(r.get("in_quantity")));
                double p = toD(str(r.get("price")));
                double total = inQ * p;
                String[] vals = {
                        String.valueOf(i), str(r.get("date")), str(r.get("code_number")), str(r.get("product_name")),
                        fmt3(inQ), str(r.get("specification")), fmt2(p), fmt2(total)};
                for (int c = 0; c < vals.length; c++) {
                    com.lowagie.text.pdf.PdfPCell cell = new com.lowagie.text.pdf.PdfPCell(new com.lowagie.text.Phrase(vals[c], cellFont));
                    if (i % 2 == 0) cell.setGrayFill(0.95f);
                    cell.setPadding(3);
                    if (c == 3) cell.setHorizontalAlignment(com.lowagie.text.Element.ALIGN_LEFT);
                    ptable.addCell(cell);
                }
            }
            if (i == 0) {
                com.lowagie.text.pdf.PdfPCell empty = new com.lowagie.text.pdf.PdfPCell(new com.lowagie.text.Phrase("No inbound records found for the selected range.", cellFont));
                empty.setColspan(8);
                ptable.addCell(empty);
            }
            doc.add(ptable);
        } finally {
            doc.close();
        }
        return bos.toByteArray();
    }

    private String html(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    /** 统一查询 + 格式化（对齐旧系统 export：RM 前缀、2 位小数、目标系统大写、正序） */
    private List<Map<String, Object>> listRange(String system, String startDate, String endDate,
                                                boolean includeIn, boolean includeOut) {
        List<Map<String, Object>> rows = stockExcelMapper.listRange(tableOf(system), startDate, endDate,
                excludeSot(system), includeIn, includeOut);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            double inQ = toD(str(r.get("in_quantity")));
            double outQ = toD(str(r.get("out_quantity")));
            double p = toD(str(r.get("price")));
            double total = (inQ - outQ) * p;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("date", str(r.get("date")));
            m.put("time", str(r.get("time")));
            m.put("code_number", str(r.get("code_number")));
            m.put("product_name", str(r.get("product_name")));
            m.put("in_quantity", fmt2(inQ));
            m.put("out_quantity", fmt2(outQ));
            m.put("target_system", String.valueOf(r.get("target_system") == null ? "" : r.get("target_system")).toUpperCase());
            m.put("specification", str(r.get("specification")));
            m.put("price", "RM " + fmt2(p));
            m.put("total", "RM " + fmt2(total));
            m.put("receiver", str(r.get("receiver")));
            m.put("remark", str(r.get("remark")));
            out.add(m);
        }
        return out;
    }

    private String td(Object o) {
        String v = o == null ? "" : String.valueOf(o).replace("<", "&lt;").replace(">", "&gt;");
        return "<td>" + v + "</td>";
    }

    private String fmt2(double v) {
        return String.format("%.2f", v);
    }

    private String fmt3(double v) {
        return String.format("%.3f", v);
    }

    private double toD(String s) {
        try { return Double.parseDouble(s.trim()); } catch (Exception e) { return 0; }
    }

    private String str(Object o) {
        return o == null ? "" : String.valueOf(o);
    }
}
