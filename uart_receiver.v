`timescale 1ns/1ps

module uart_receiver (
    input clk,
    input rst,
    input rx,
    input rdy_clr,
    input rx_en,
    output reg rdy,
    output reg [7:0] data_out
);
    parameter [1:0] START = 2'b00;
    parameter [1:0] DATAOUT = 2'b01;
    parameter [1:0] STOP = 2'b10;

    reg [1:0] state;
    reg [3:0] sample;
    reg [3:0] index;
    reg [7:0] temp;

    always @(posedge clk) begin
        if (rst) begin
            state <= START;
            sample <= 4'd0;
            index <= 4'd0;
            temp <= 8'd0;
            data_out <= 8'd0;
            rdy <= 1'b0;
        end else begin
            if (rdy_clr) begin
                rdy <= 1'b0;
            end

            if (rx_en) begin
                case (state)
                    START: begin
                        if (rx == 1'b0) begin
                            sample <= sample + 4'd1;
                            if (sample == 4'd15) begin
                                sample <= 4'd0;
                                index <= 4'd0;
                                temp <= 8'd0;
                                state <= DATAOUT;
                            end
                        end else begin
                            sample <= 4'd0;
                        end
                    end

                    DATAOUT: begin
                        sample <= sample + 4'd1;

                        if (sample == 4'd7) begin
                            temp[index[2:0]] <= rx;
                            index <= index + 4'd1;
                        end

                        if ((index == 4'd8) && (sample == 4'd15)) begin
                            sample <= 4'd0;
                            state <= STOP;
                        end
                    end

                    STOP: begin
                        sample <= sample + 4'd1;
                        if (sample == 4'd15) begin
                            state <= START;
                            sample <= 4'd0;
                            data_out <= temp;
                            rdy <= 1'b1;
                        end
                    end

                    default: begin
                        state <= START;
                        sample <= 4'd0;
                        index <= 4'd0;
                    end
                endcase
            end
        end
    end
endmodule
