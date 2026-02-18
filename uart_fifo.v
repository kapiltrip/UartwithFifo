`timescale 1ns/1ps

// Minimal 16-deep, 8-bit synchronous FIFO (single clock).
// - Write when `wr_en` and not `full`
// - Read (pop) when `rd_en` and not `empty`
// - `rd_data` is "show-ahead" (always shows the front element)
module uart_fifo (
    input clk,
    input reset,

    input wr_en,
    input [7:0] wr_data,
    output full,

    input rd_en,
    output [7:0] rd_data,
    output empty
);
    reg [7:0] mem [0:15];
    reg [3:0] wr_ptr;
    reg [3:0] rd_ptr;
    reg [4:0] count;

    assign empty = (count == 5'd0);
    assign full  = (count == 5'd16);

    assign rd_data = mem[rd_ptr];

    wire do_write = wr_en && !full;
    wire do_read  = rd_en && !empty;

    always @(posedge clk) begin
        if (reset) begin
            wr_ptr <= 4'd0;
            rd_ptr <= 4'd0;
            count  <= 5'd0;
        end else begin
            if (do_write) begin
                mem[wr_ptr] <= wr_data;
                wr_ptr <= wr_ptr + 4'd1;
            end

            if (do_read) begin
                rd_ptr <= rd_ptr + 4'd1;
            end

            case ({do_write, do_read})
                2'b10: count <= count + 5'd1;
                2'b01: count <= count - 5'd1;
                default: count <= count;
            endcase
        end
    end
endmodule
