connect system/secret@localhost:1521/FREEPDB1;
create user demo;
grant connect, resource, create session to demo;
alter user demo identified by demo;
grant all privileges to demo;
connect demo/demo@localhost:1521/FREEPDB1;
create table test (id NUMBER, text VARCHAR(128));
CREATE TABLE POSTS (
  id NUMBER PRIMARY KEY,
  title VARCHAR2(100),
  description VARCHAR2(2000),
  author VARCHAR2(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE SEQUENCE posts_seq
  START WITH 1
  INCREMENT BY 1
  NOCACHE
  NOCYCLE;

CREATE OR REPLACE TRIGGER posts_bir_trg
BEFORE INSERT ON POSTS
FOR EACH ROW
BEGIN
  :NEW.id := posts_seq.NEXTVAL;
END;
/

commit;