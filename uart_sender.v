`timescale 1ns/1ps

module uart_sender (
    input clk,
    input rst,
    input wr_en,
    input tx_en,
    input [7:0] data_in,
    output reg tx,
    output busy
);
    parameter [1:0] IDLE = 2'b00;
    parameter [1:0] START = 2'b01;
    parameter [1:0] DATA = 2'b10;
    parameter [1:0] STOP = 2'b11;

    reg [1:0] state;
    reg [7:0] data;
    reg [2:0] index;

    assign busy = (state != IDLE);

    always @(posedge clk) begin
        if (rst) begin
            state <= IDLE;
            tx <= 1'b1;
            data <= 8'd0;
            index <= 3'd0;
        end else begin
            case (state)
                IDLE: begin
                    tx <= 1'b1;
                    index <= 3'd0;
                    if (wr_en) begin
                        data <= data_in;
                        state <= START;
                    end
                end

                START: begin
                    if (tx_en) begin
                        tx <= 1'b0;
                        state <= DATA;
                        index <= 3'd0;
                    end
                end

                DATA: begin
                    if (tx_en) begin
                        tx <= data[index];
                        if (index == 3'd7) begin
                            state <= STOP;
                        end else begin
                            index <= index + 3'd1;
                        end
                    end
                end

                STOP: begin
                    if (tx_en) begin
                        tx <= 1'b1;
                        state <= IDLE;
                    end
                end

                default: begin
                    state <= IDLE;
                    tx <= 1'b1;
                    index <= 3'd0;
                end
            endcase
        end
    end
endmodule
