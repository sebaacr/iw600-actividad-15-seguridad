-- Actividad 15 - Desafío B: recuperación de contraseña
-- Ejecutar después de 01_esquema.sql
USE iw_seguridad;

ALTER TABLE usuarios
  ADD COLUMN token_recuperacion_hash CHAR(64) NULL,
  ADD COLUMN token_recuperacion_expira DATETIME NULL;
